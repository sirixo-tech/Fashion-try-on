import "reflect-metadata";
import { JwtService } from "@nestjs/jwt";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerAuthService } from "./customer-auth.service.js";
import { PrismaService } from "../database/prisma.service.js";

describe("customer session policy enforcement", () => {
  afterEach(() => vi.unstubAllEnvs());
  async function fixture() {
    vi.stubEnv("SELFX_CUSTOMER_AUTH_ENABLED", "true");
    vi.stubEnv(
      "SELFX_CUSTOMER_JWT_SECRET",
      "test_customer_session_secret_abcdefghijklmnopqrstuvwxyz",
    );
    const jwt = new JwtService();
    const session = {
      id: "session",
      customerId: "customer",
      familyId: "family",
      tokenHash: "hash",
      revokedAt: null,
      authenticatedAt: new Date(Date.now() - 24 * 3600000),
      lastUserActivityAt: new Date(),
      expiresAt: new Date(Date.now() + 6 * 3600000),
      deviceName: null,
      customer: { id: "customer", status: "ACTIVE", securityVersion: 1 },
    };
    const tx = {
      customerSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        findUniqueOrThrow: vi.fn().mockResolvedValue(session),
        update: vi.fn(),
        create: vi.fn(),
      },
      customerPushDevice: { updateMany: vi.fn() },
      customer: { update: vi.fn() },
      $queryRaw: vi.fn(),
    };
    const db = {
      ...tx,
      $transaction: async (run: (client: typeof tx) => unknown) => run(tx),
    };
    const auth = new CustomerAuthService(
      db as unknown as PrismaService,
      {} as never,
      jwt,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(
      auth as unknown as { limit(): Promise<void> },
      "limit",
    ).mockResolvedValue(undefined);
    const token = await jwt.signAsync(
      { sub: "customer", sid: "session", ver: 1, typ: "customer_access" },
      {
        secret: auth.config.secret,
        issuer: "selfx",
        audience: "selfx-customer",
        expiresIn: 600,
      },
    );
    return { auth, session, tx, header: `Bearer ${token}` };
  }
  it("allows active access after 24 hours, then rejects idle access and attempted revival", async () => {
    const { auth, session, header, tx } = await fixture();
    await expect(auth.requireCustomer(header)).resolves.toMatchObject({
      sessionId: "session",
    });
    session.lastUserActivityAt = new Date(Date.now() - 15 * 60000);
    await expect(auth.requireCustomer(header)).rejects.toMatchObject({
      status: 401,
    });
    await expect(auth.sessionStatus(header, true)).rejects.toMatchObject({
      status: 401,
    });
    expect(tx.customerSession.update).not.toHaveBeenCalled();
  });
  it("rejects idle refresh and the hard deadline independently of JWT lifetime", async () => {
    const { auth, session, header, tx } = await fixture();
    session.lastUserActivityAt = new Date(Date.now() - 15 * 60000);
    await expect(auth.refresh("secret", "127.0.0.1")).rejects.toMatchObject({
      status: 401,
    });
    expect(tx.customerSession.create).not.toHaveBeenCalled();
    session.lastUserActivityAt = new Date();
    session.authenticatedAt = new Date(Date.now() - 30 * 3600000);
    await expect(auth.requireCustomer(header)).rejects.toMatchObject({
      status: 401,
    });
  });
  it("carries original authentication and activity through refresh rotation", async () => {
    const { auth, session, tx } = await fixture();
    // Isolate token issuance from profile mapping, preserving the real rotation transaction.
    vi.spyOn(
      auth as unknown as { bundle(): Promise<object> },
      "bundle",
    ).mockResolvedValue({ accessToken: "next" });
    await auth.refresh("secret", "127.0.0.1");
    expect(tx.customerSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        familyId: session.familyId,
        authenticatedAt: session.authenticatedAt,
        lastUserActivityAt: session.lastUserActivityAt,
        expiresAt: session.expiresAt,
      }),
    });
  });
});
