import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaService } from "../database/prisma.service.js";
import { CustomerMetricsService } from "./customer-metrics.service.js";

const url = process.env.CUSTOMER_AUTH_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/customer_auth_test")
)
  throw new Error("Dedicated disposable localhost customer_auth_test required");
describe.skipIf(!url)("Mobile customer metrics: PostgreSQL", () => {
  const db = new PrismaClient({
    datasourceUrl: url ?? "postgresql://unused@localhost/customer_auth_test",
  });
  const service = new CustomerMetricsService(db as PrismaService);
  beforeAll(async () => {
    vi.stubEnv("SELFX_CUSTOMER_AUTH_ENABLED", "true");
    await db.$connect();
  });
  beforeEach(async () => {
    await db.customer.deleteMany();
  });
  afterAll(async () => {
    await db.customer.deleteMany();
    await db.$disconnect();
    vi.unstubAllEnvs();
  });
  it("counts global customer accounts with explicit period/snapshot semantics and excludes deleted PII", async () => {
    const now = Date.now(),
      day = 86400000;
    for (const [index, status, createdDays, activeDays] of [
      [0, "ACTIVE", 1, 1],
      [1, "ACTIVE", 40, 2],
      [2, "PENDING_VERIFICATION", 2, null],
      [3, "SUSPENDED", 3, 3],
      [4, "DELETED", 1, 1],
    ] as const) {
      const customerId = randomUUID();
      await db.customer.create({
        data: {
          id: customerId,
          email: `private-${index}@selfx.invalid`,
          displayName: "Private customer name",
          status,
          termsVersion: "test",
          termsAcceptedAt: new Date(),
          createdAt: new Date(now - createdDays * day),
          lastActiveAt:
            activeDays == null ? null : new Date(now - activeDays * day),
          identities: {
            create: {
              id: randomUUID(),
              provider: index === 1 ? "GOOGLE" : "EMAIL_PASSWORD",
              providerSubject: `private-subject-${index}`,
              verifiedAt: status === "ACTIVE" ? new Date() : null,
            },
          },
        },
      });
    }
    const result = await service.summary({ range: "7d" });
    expect(result.totals).toEqual({
      total: 4,
      newAccounts: 3,
      recentlyActive: 2,
      verified: 2,
      pending: 1,
      suspended: 1,
    });
    expect(result.daily.reduce((sum, row) => sum + row.accounts, 0)).toBe(3);
    expect(result.daily.some((row) => row.accounts === 0)).toBe(true);
    expect(result.methods).toEqual(
      expect.arrayContaining([
        { provider: "GOOGLE", accounts: 1 },
        { provider: "EMAIL_PASSWORD", accounts: 1 },
      ]),
    );
    expect(JSON.stringify(result)).not.toMatch(
      /private-|selfx.invalid|Private customer name|tokenHash|passwordHash/,
    );
    expect(result.unavailable).toEqual([
      "tryOns",
      "personalBilling",
      "storeQr",
    ]);
    const today = await service.summary({ range: "today" });
    expect(today.range.from).toMatch(/T00:00:00.000Z$/);
    expect(today.totals?.newAccounts).toBe(0);
    expect(today.totals?.total).toBe(4);
  });
  it("returns real zero counts and a gap-filled chart for an enabled empty database", async () => {
    const result = await service.summary({ range: "30d" });
    expect(result.available).toBe(true);
    expect(result.totals).toEqual({
      total: 0,
      newAccounts: 0,
      recentlyActive: 0,
      verified: 0,
      pending: 0,
      suspended: 0,
    });
    expect(result.daily.length).toBeGreaterThanOrEqual(30);
    expect(result.daily.every((row) => row.accounts === 0)).toBe(true);
    expect(result.methods).toEqual([]);
  });
});
