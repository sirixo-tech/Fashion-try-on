import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSelfxId } from "@selfx/database";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { decryptProviderSecret } from "../integrations/provider-secret-cipher.js";
import { PaymentSettingsService } from "./payment-settings.service.js";
import type { SavePhonePeConnectionDto } from "./payment-settings.dto.js";
const databaseUrl = process.env.STOCK_TEST_DATABASE_URL;
async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(
    promise.catch((error: ApiErrorException) => error.getResponse()),
  ).resolves.toMatchObject({ error: { code } });
}
if (
  databaseUrl &&
  (!["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname) ||
    !new URL(databaseUrl).pathname.endsWith("_test"))
)
  throw new Error("Use a disposable localhost database ending in _test.");
describe.skipIf(!databaseUrl)("PAYMENTS-1A PostgreSQL", () => {
  const prisma = new PrismaService({
    datasourceUrl: databaseUrl ?? "postgresql://unused@localhost/unused_test",
  });
  const service = new PaymentSettingsService(prisma);
  const stores: string[] = [],
    actor = createSelfxId(),
    key = Buffer.alloc(32, 8);
  const oldKey = process.env.SELFX_PAYMENT_ENCRYPTION_KEY;
  const oldVersion = process.env.SELFX_PAYMENT_ENCRYPTION_KEY_VERSION;
  const input = (
    override: Partial<SavePhonePeConnectionDto> = {},
  ): SavePhonePeConnectionDto => ({
    expectedVersion: 0,
    environment: "UNCONFIRMED",
    merchantId: "fixture_mid",
    providerId: "fixture_provider",
    saltKey: "fixture-do-not-display-this-key",
    saltIndex: "1",
    ...override,
  });
  beforeAll(async () => {
    process.env.SELFX_PAYMENT_ENCRYPTION_KEY = key.toString("base64");
    process.env.SELFX_PAYMENT_ENCRYPTION_KEY_VERSION = "test_v1";
    await prisma.$connect();
    await prisma.user.create({
      data: {
        id: actor,
        email: `${actor}@payments.invalid`,
        passwordHash: "not-a-login",
      },
    });
    const current = (await service.listGateways()).data.find(
      (item) => item.provider === "PHONEPE",
    )!;
    await service.updatePolicy("PHONEPE", actor, {
      expectedVersion: current.version,
      enabled: true,
    });
  });
  afterAll(async () => {
    await prisma.storePaymentSettings.deleteMany({
      where: { organizationId: { in: stores } },
    });
    await prisma.storePaymentConnection.deleteMany({
      where: { organizationId: { in: stores } },
    });
    await prisma.auditLog.deleteMany({ where: { actorUserId: actor } });
    await prisma.organization.deleteMany({ where: { id: { in: stores } } });
    await prisma.user.delete({ where: { id: actor } });
    await prisma.$disconnect();
    if (oldKey === undefined) delete process.env.SELFX_PAYMENT_ENCRYPTION_KEY;
    else process.env.SELFX_PAYMENT_ENCRYPTION_KEY = oldKey;
    if (oldVersion === undefined)
      delete process.env.SELFX_PAYMENT_ENCRYPTION_KEY_VERSION;
    else process.env.SELFX_PAYMENT_ENCRYPTION_KEY_VERSION = oldVersion;
  });
  async function store() {
    const id = createSelfxId();
    stores.push(id);
    await prisma.organization.create({
      data: {
        id,
        slug: `payments-${id}`,
        name: "Payment test",
        status: "ACTIVE",
      },
    });
    return id;
  }
  it("saves only encrypted credentials and returns metadata without keys or merchant IDs", async () => {
    const id = await store();
    const saved = await service.savePhonePe(id, actor, input());
    expect(saved).toMatchObject({
      version: 1,
      selectedProvider: null,
      paymentAvailable: false,
      connections: [
        {
          provider: "PHONEPE",
          environment: "UNCONFIRMED",
          status: "UNVERIFIED",
        },
      ],
    });
    const row = await prisma.storePaymentConnection.findUniqueOrThrow({
      where: {
        organizationId_provider: { organizationId: id, provider: "PHONEPE" },
      },
    });
    expect(JSON.stringify(row)).not.toContain(input().saltKey);
    expect(JSON.stringify(saved)).not.toContain(input().merchantId);
    const plain = decryptProviderSecret<Record<string, string>>(row, key);
    expect(plain).toMatchObject({
      organizationId: id,
      provider: "PHONEPE",
      saltKey: input().saltKey,
      providerStoreId: `SX${id.replaceAll("-", "")}`,
    });
    const logs = await prisma.auditLog.findMany({
      where: { organizationId: id },
    });
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain(input().saltKey);
    expect(logs[0]?.actorUserId).toBe(actor);
  });
  it("prevents selecting another Store's configured account, including at the FK boundary", async () => {
    const a = await store(),
      b = await store();
    await service.savePhonePe(a, actor, input());
    expect((await service.getStore(b)).connections).toHaveLength(0);
    await expect(
      service.select(b, actor, { expectedVersion: 0, provider: "PHONEPE" }),
    ).rejects.toThrow();
    await expect(
      prisma.storePaymentSettings.create({
        data: { organizationId: b, selectedProvider: "PHONEPE" },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("allows only one concurrent initial configuration write and rejects stale replacements", async () => {
    const id = await store();
    const results = await Promise.allSettled([
      service.savePhonePe(id, actor, input()),
      service.savePhonePe(id, actor, input({ merchantId: "other_fixture" })),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(
      await prisma.storePaymentConnection.count({
        where: { organizationId: id },
      }),
    ).toBe(1);
    expect((await service.getStore(id)).version).toBe(1);
    await expectCode(
      service.savePhonePe(id, actor, input()),
      "PAYMENT_SETTINGS_CHANGED",
    );
  });
  it("selects and clears a gateway without claiming verification or enabling payment", async () => {
    const id = await store();
    await service.savePhonePe(id, actor, input());
    expect(
      await service.select(id, actor, {
        expectedVersion: 1,
        provider: "PHONEPE",
      }),
    ).toMatchObject({
      version: 2,
      selectedProvider: "PHONEPE",
      paymentAvailable: false,
    });
    expect(
      await service.select(id, actor, { expectedVersion: 2, provider: null }),
    ).toMatchObject({ version: 3, selectedProvider: null });
  });
  it("lists all gateways for Platform administration but only enabled supported gateways for Stores", async () => {
    const id = await store();
    expect(
      (await service.listGateways()).data.map((item) => item.provider),
    ).toEqual(["PHONEPE", "RAZORPAY", "STRIPE", "PAYTM", "PAYPAL"]);
    expect(
      (await service.getStore(id)).gateways.map((item) => item.provider),
    ).toEqual(["PHONEPE"]);
  });
  it("hides disabled gateways and blocks selection/setup/edit without deleting Store credentials", async () => {
    const id = await store();
    await service.savePhonePe(id, actor, input());
    await service.select(id, actor, {
      expectedVersion: 1,
      provider: "PHONEPE",
    });
    const current = (await service.listGateways()).data.find(
      (item) => item.provider === "PHONEPE",
    )!;
    await service.updatePolicy("PHONEPE", actor, {
      expectedVersion: current.version,
      enabled: false,
    });
    await expectCode(
      service.select(id, actor, { expectedVersion: 2, provider: "PHONEPE" }),
      "PAYMENT_GATEWAY_DISABLED",
    );
    await expectCode(
      service.savePhonePe(id, actor, input({ expectedVersion: 2 })),
      "PAYMENT_GATEWAY_DISABLED",
    );
    await expectCode(
      service.editPhonePe(id, actor, input({ expectedVersion: 2 })),
      "PAYMENT_GATEWAY_DISABLED",
    );
    const disabled = await service.getStore(id);
    expect(disabled.gateways).toEqual([]);
    expect(disabled.connections).toHaveLength(1);
    expect(disabled.selectedProvider).toBe("PHONEPE");
    await service.updatePolicy("PHONEPE", actor, {
      expectedVersion: current.version + 1,
      enabled: true,
    });
    const restored = await service.getStore(id);
    expect(restored.gateways.map((item) => item.provider)).toEqual(["PHONEPE"]);
    expect(restored.connections).toEqual(disabled.connections);
    expect(restored.selectedProvider).toBe("PHONEPE");
    await expectCode(
      service.updatePolicy("PHONEPE", actor, {
        expectedVersion: current.version,
        enabled: false,
      }),
      "PAYMENT_SETTINGS_CHANGED",
    );
  });
  it("does not enable planned providers and rejects missing/archived Stores", async () => {
    await expect(
      service.updatePolicy("STRIPE", actor, {
        expectedVersion: 0,
        enabled: true,
      }),
    ).rejects.toThrow();
    await expectCode(service.getStore(createSelfxId()), "STORE_NOT_FOUND");
    const id = await store();
    await prisma.organization.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });
    await expectCode(
      service.savePhonePe(id, actor, input()),
      "STORE_NOT_FOUND",
    );
  });
});
