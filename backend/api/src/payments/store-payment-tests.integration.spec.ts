import "reflect-metadata";
import { createHash } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { PlatformPaymentTestsService } from "./platform-payment-tests.service.js";
import { PaymentSettingsService } from "./payment-settings.service.js";
import type { ProviderRequest } from "./payment-adapter.js";
import type { SavePhonePeConnectionDto } from "./payment-settings.dto.js";
import { PaymentProviderError } from "./payment-diagnostics.js";
import { Logger } from "@nestjs/common";

const url = process.env.PAYMENT_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test"))
)
  throw new Error("Disposable localhost test database required.");
const salt = "fixture-store-qr-salt-not-real";
describe.skipIf(!url)(
  "Store PhonePe verification — PostgreSQL with simulated transport",
  () => {
    const db = new PrismaService({
      datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
    });
    const send = vi.fn<(request: ProviderRequest) => Promise<unknown>>();
    const settings = new PaymentSettingsService(db);
    let engine: PlatformPaymentTestsService;
    const actor = createSelfxId();
    let a: string, b: string;
    const old = new Map<string, string | undefined>();
    beforeAll(async () => {
      for (const [key, value] of Object.entries({
        SELFX_PAYMENT_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString("base64"),
        SELFX_PAYMENT_ENCRYPTION_KEY_VERSION: "store_verification_fixture",
        SELFX_PHONEPE_UAT_ENABLED: "true",
        SELFX_PAYMENT_CALLBACK_BASE_URL: "https://callbacks.example.test",
      })) {
        old.set(key, process.env[key]);
        process.env[key] = value;
      }
      await db.$connect();
      await db.user.create({
        data: {
          id: actor,
          email: `${actor}@store-probes.test`,
          passwordHash: "not-a-login",
        },
      });
    });
    beforeEach(async () => {
      vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
      engine = new PlatformPaymentTestsService(db, { send } as never);
      a = createSelfxId();
      b = createSelfxId();
      await db.organization.createMany({
        data: [a, b].map((id) => ({
          id,
          name: "Probe Store",
          slug: id,
          status: "ACTIVE",
        })),
      });
      const policy = (await settings.listGateways()).data.find(
        (row) => row.provider === "PHONEPE",
      )!;
      await settings.updatePolicy("PHONEPE", actor, {
        expectedVersion: policy.version,
        enabled: true,
      });
      process.env.SELFX_PHONEPE_UAT_ENABLED = "true";
      process.env.SELFX_PAYMENT_CALLBACK_BASE_URL =
        "https://callbacks.example.test";
      send.mockReset();
      send.mockImplementation(async (request) => {
        if (request.method === "POST") {
          const payload = JSON.parse(
            Buffer.from(JSON.parse(request.body!).request, "base64").toString(),
          );
          return {
            success: true,
            code: "SUCCESS",
            data: {
              ...payload,
              qrString: `upi://pay?pa=fixture@ybl&am=1.00&tr=${payload.transactionId}`,
            },
          };
        }
        const transactionId = request.url.split("/").at(-2)!;
        const row = await db.platformPaymentTest.findUniqueOrThrow({
          where: { transactionId },
        });
        return evidence(row.transactionId, row.organizationId ?? "platform");
      });
      await save(a);
      await save(b);
    });
    afterEach(async () => {
      await db.storePaymentSettings.deleteMany({
        where: { organizationId: { in: [a, b] } },
      });
      await db.storePaymentConnection.deleteMany({
        where: { organizationId: { in: [a, b] } },
      });
      // Organization deletion must cascade only its scoped probes and events.
      await db.organization.deleteMany({ where: { id: { in: [a, b] } } });
      await db.platformPaymentTest.deleteMany({
        where: { createdById: actor },
      });
      await db.platformPaymentTestConnection.deleteMany();
      await db.auditLog.deleteMany({ where: { actorUserId: actor } });
      vi.restoreAllMocks();
    });
    afterAll(async () => {
      await db.user.delete({ where: { id: actor } });
      await db.$disconnect();
      for (const [key, value] of old) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    async function save(
      storeId: string,
      override: Partial<SavePhonePeConnectionDto> = {},
    ) {
      const current = await settings.getStore(storeId);
      return settings.savePhonePe(storeId, actor, {
        expectedVersion: current.version,
        environment: "UAT",
        dqrAccessConfirmed: true,
        merchantId: merchant(storeId),
        saltIndex: "1",
        saltKey: salt,
        ...override,
      });
    }
    function merchant(storeId: string) {
      return `MID_${storeId.replaceAll("-", "")}`;
    }
    async function start(storeId: string | null = a, key = createSelfxId()) {
      const workspace = await engine.workspace(storeId);
      return engine.start(
        actor,
        { expectedVersion: workspace.connection!.version, idempotencyKey: key },
        storeId,
      );
    }
    async function due(id: string) {
      await db.platformPaymentTest.update({
        where: { id },
        data: { leaseUntil: null, nextCheckAt: new Date(0) },
      });
    }
    function evidence(
      transactionId: string,
      storeId: string,
      status = "PAYMENT_SUCCESS",
    ) {
      return {
        success: status === "PAYMENT_SUCCESS",
        code: status,
        data: {
          merchantId: merchant(storeId),
          transactionId,
          amount: 100,
          paymentState:
            status === "PAYMENT_SUCCESS"
              ? "COMPLETED"
              : status === "PAYMENT_ERROR"
                ? "FAILED"
                : "PENDING",
          providerReferenceId: `REF_${transactionId}`,
        },
      };
    }
    async function callback(id: string, storeId: string, payload?: unknown) {
      const row = await db.platformPaymentTest.findUniqueOrThrow({
        where: { id },
      });
      const encoded = Buffer.from(
        JSON.stringify(payload ?? evidence(row.transactionId, storeId)),
      ).toString("base64");
      return engine.callback(
        id,
        encoded,
        createHash("sha256")
          .update(encoded + salt)
          .digest("hex") + "###1",
        "127.0.0.1",
        storeId,
      );
    }
    it("isolates Store and platform tests, credentials, idempotency keys and history", async () => {
      await engine.save(actor, {
        expectedVersion: 0,
        environment: "UAT",
        dqrAccessConfirmed: true,
        merchantId: merchant("platform"),
        saltKey: salt,
        saltIndex: "1",
      });
      const key = createSelfxId();
      const [ta, tb, platform] = await Promise.all([
        start(a, key),
        start(b, key),
        start(null, key),
      ]);
      expect(new Set([ta.id, tb.id, platform.id]).size).toBe(3);
      expect((await engine.workspace(a)).tests.map((row) => row.id)).toEqual([
        ta.id,
      ]);
      expect((await engine.workspace(b)).tests.map((row) => row.id)).toEqual([
        tb.id,
      ]);
      expect((await engine.workspace()).tests.map((row) => row.id)).toEqual([
        platform.id,
      ]);
      const raw = await db.platformPaymentTest.findUniqueOrThrow({
        where: { id: ta.id },
      });
      expect(raw).toMatchObject({
        scopeKey: `STORE:${a}`,
        organizationId: a,
        connectionVersion: 1,
      });
      expect(raw.transactionId.startsWith("ST")).toBe(true);
      const safe = JSON.stringify([
        await engine.workspace(a),
        await engine.detail(ta.id, a),
      ]);
      for (const secret of [
        salt,
        merchant(a),
        "encryptedPayload",
        "keyDigest",
        "authenticationTag",
      ])
        expect(safe).not.toContain(secret);
      const audits = await db.auditLog.findMany({
        where: { organizationId: a },
      });
      expect(
        audits.some((row) => row.action === "STORE_PAYMENT_TEST_STARTED"),
      ).toBe(true);
      expect(JSON.stringify(audits)).not.toContain(salt);
    });
    it("denies foreign Store and platform access before any status request or callback insertion", async () => {
      const test = await start();
      send.mockClear();
      await expect(engine.detail(test.id, b)).rejects.toThrow();
      await expect(engine.detail(test.id)).rejects.toThrow();
      await expect(engine.check(test.id, actor, b)).rejects.toThrow();
      await expect(
        engine.callback(test.id, "encoded", "signature", "127.0.0.1", b),
      ).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
      expect(
        await db.platformPaymentTestEvent.count({ where: { testId: test.id } }),
      ).toBe(0);
    });
    it("requires independent provider success; a signed callback alone does not pass", async () => {
      const test = await start();
      await callback(test.id, a);
      expect((await engine.workspace(a)).testStatus).toBe("UNKNOWN");
      const row = await db.platformPaymentTest.findUniqueOrThrow({
        where: { id: test.id },
      });
      send.mockResolvedValueOnce(
        evidence(row.transactionId, a, "PAYMENT_PENDING"),
      );
      await due(test.id);
      await engine.check(test.id, actor, a);
      expect((await engine.workspace(a)).testStatus).toBe("UNKNOWN");
      await due(test.id);
      await engine.check(test.id, actor, a);
      expect((await engine.workspace(a)).testStatus).toBe("PASSED");
      expect((await engine.workspace(b)).testStatus).toBe("NOT_TESTED");
      expect((await settings.getStore(a)).paymentAvailable).toBe(false);
    });
    it("retains old credential snapshots but resets verification after replacement", async () => {
      const test = await start();
      await save(a, { merchantId: "replacement_mid" });
      expect((await engine.workspace(a)).connection?.version).toBe(2);
      await callback(test.id, a);
      await due(test.id);
      await engine.check(test.id, actor, a);
      expect((await engine.detail(test.id, a)).status).toBe("SUCCEEDED");
      expect((await engine.workspace(a)).testStatus).toBe("NOT_TESTED");
      const settingsBefore = await settings.getStore(a);
      await settings.select(a, actor, {
        expectedVersion: settingsBefore.version,
        provider: "PHONEPE",
      });
      expect((await engine.workspace(a)).connection?.version).toBe(2);
    });
    it("replays an uncertain start without sending another QR and blocks a new active test", async () => {
      const key = createSelfxId();
      send.mockRejectedValueOnce(new Error("timeout"));
      const first = await start(a, key);
      const replay = await start(a, key);
      expect(replay.id).toBe(first.id);
      expect(first.status).toBe("UNKNOWN");
      expect(send).toHaveBeenCalledTimes(1);
      await expect(start(a)).rejects.toMatchObject(
        error("PAYMENT_TEST_PENDING"),
      );
    });
    it.each(["UNCONFIRMED", "PRODUCTION"] as const)(
      "never executes %s credentials as a UAT test",
      async (environment) => {
        await save(a, { environment, dqrAccessConfirmed: false });
        await expect(start(a)).rejects.toMatchObject(
          error("PAYMENT_ACCOUNT_UNCONFIRMED"),
        );
        expect(send).not.toHaveBeenCalled();
      },
    );
    it("enforces execution, callback and platform availability gates without deleting test history", async () => {
      process.env.SELFX_PHONEPE_UAT_ENABLED = "false";
      await expect(start()).rejects.toMatchObject(error("PAYMENT_NOT_ENABLED"));
      process.env.SELFX_PHONEPE_UAT_ENABLED = "true";
      delete process.env.SELFX_PAYMENT_CALLBACK_BASE_URL;
      await expect(start()).rejects.toThrow();
      process.env.SELFX_PAYMENT_CALLBACK_BASE_URL =
        "https://callbacks.example.test";
      const test = await start();
      const policy = (await settings.listGateways()).data.find(
        (row) => row.provider === "PHONEPE",
      )!;
      await settings.updatePolicy("PHONEPE", actor, {
        expectedVersion: policy.version,
        enabled: false,
      });
      await expect(start(b)).rejects.toMatchObject(
        error("PAYMENT_GATEWAY_DISABLED"),
      );
      await due(test.id);
      expect((await engine.check(test.id, actor, a)).status).toBe("SUCCEEDED");
    });
    it("rejects a mismatched merchant notification and cascades only the deleted Store's probes", async () => {
      const ta = await start(a),
        tb = await start(b);
      const row = await db.platformPaymentTest.findUniqueOrThrow({
        where: { id: ta.id },
      });
      await expect(
        callback(ta.id, a, evidence(row.transactionId, b)),
      ).rejects.toThrow();
      await callback(ta.id, a);
      await db.storePaymentSettings.deleteMany({
        where: { organizationId: a },
      });
      await db.storePaymentConnection.deleteMany({
        where: { organizationId: a },
      });
      await db.organization.delete({ where: { id: a } });
      expect(await db.platformPaymentTest.count({ where: { id: ta.id } })).toBe(
        0,
      );
      expect(
        await db.platformPaymentTestEvent.count({ where: { testId: ta.id } }),
      ).toBe(0);
      expect((await engine.detail(tb.id, b)).id).toBe(tb.id);
    });
    it("persists separate sanitized QR/status diagnostics, survives reopening and retains late success", async () => {
      const key = createSelfxId();
      send.mockRejectedValueOnce(
        new PaymentProviderError("HTTP_REJECTED", 401, "AUTHORIZATION_FAILED"),
      );
      const test = await start(a, key);
      expect(test.status).toBe("UNKNOWN");
      expect(test.qrString).toBeNull();
      expect(test.diagnostics.initialization).toMatchObject({
        code: "HTTP_REJECTED",
        httpStatus: 401,
        providerCode: "AUTHORIZATION_FAILED",
      });
      expect(send).toHaveBeenCalledTimes(1);
      expect((await start(a, key)).id).toBe(test.id);
      expect(send).toHaveBeenCalledTimes(1);
      const reopened = await new PlatformPaymentTestsService(db, {
        send,
      } as never).detail(test.id, a);
      expect(reopened.diagnostics).toEqual(test.diagnostics);
      await expect(engine.detail(test.id, b)).rejects.toThrow();
      await expect(engine.detail(test.id)).rejects.toThrow();
      expect(JSON.stringify(await engine.workspace(a))).not.toContain(
        "initializationDiagnostic",
      );
      await due(test.id);
      send.mockRejectedValueOnce(new Error(`sensitive transport data ${salt}`));
      const checked = await engine.check(test.id, actor, a);
      expect(checked.status).toBe("UNKNOWN");
      expect(checked.diagnostics.initialization).toEqual(
        test.diagnostics.initialization,
      );
      expect(checked.diagnostics.status?.code).toBe("UNCLASSIFIED");
      expect(JSON.stringify(checked)).not.toContain(salt);
      expect(
        JSON.stringify(vi.mocked(Logger.prototype.warn).mock.calls),
      ).not.toContain(salt);
      await expect(start(a)).rejects.toMatchObject(
        error("PAYMENT_TEST_PENDING"),
      );
      await due(test.id);
      const success = await engine.check(test.id, actor, a);
      expect(success.status).toBe("SUCCEEDED");
      expect(success.diagnostics.status).toBeNull();
      expect(success.diagnostics.initialization).toEqual(
        test.diagnostics.initialization,
      );
    });
    it("explains a successful HTTP response with invalid QR data without accepting it", async () => {
      send.mockImplementationOnce(async (request) => {
        const payload = JSON.parse(
          Buffer.from(JSON.parse(request.body!).request, "base64").toString(),
        );
        return {
          success: true,
          code: "SUCCESS",
          message: salt,
          data: {
            ...payload,
            amount: 200,
            qrString: `upi://pay?tr=${payload.transactionId}&am=2.00`,
          },
        };
      });
      const test = await start();
      expect(test.status).toBe("UNKNOWN");
      expect(test.diagnostics.initialization?.code).toBe("AMOUNT_MISMATCH");
      expect(test.qrString).toBeNull();
      expect(JSON.stringify(test)).not.toContain(salt);
    });
  },
);
function error(code: string) {
  return {
    response: expect.objectContaining({
      error: expect.objectContaining({ code }),
    }),
  };
}
