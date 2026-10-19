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
        SELFX_PHONEPE_PRODUCTION_ENABLED: "false",
        SELFX_PHONEPE_PRODUCTION_BASE_URL: "",
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
      process.env.SELFX_PHONEPE_PRODUCTION_ENABLED = "false";
      process.env.SELFX_PHONEPE_PRODUCTION_BASE_URL = "";
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
    it.each(["PENDING", "UNKNOWN", "PREPARING"] as const)(
      "replaces an expired %s QR with a unique test and still verifies late success",
      async (status) => {
        const key = createSelfxId();
        const first = await start(a, key);
        await db.platformPaymentTest.update({
          where: { id: first.id },
          data: { status, expiresAt: new Date(Date.now() - 1) },
        });
        const second = await start(a);
        expect(second.id).not.toBe(first.id);
        expect(
          Date.parse(second.expiresAt) - Date.parse(second.serverTime),
        ).toBeGreaterThan(290000);
        expect(
          Date.parse(second.expiresAt) - Date.parse(second.serverTime),
        ).toBeLessThanOrEqual(300000);
        const rows = await db.platformPaymentTest.findMany({
          where: { id: { in: [first.id, second.id] } },
        });
        expect(new Set(rows.map((row) => row.transactionId)).size).toBe(2);
        expect((await engine.detail(first.id, a)).qrString).toBeNull();
        expect((await engine.detail(first.id, a)).status).toBe(status);
        // Even after expiry, replaying an old request must never initialize it again.
        expect((await start(a, key)).id).toBe(first.id);
        expect(send).toHaveBeenCalledTimes(2);
        await expect(start(a)).rejects.toMatchObject(
          error("PAYMENT_TEST_PENDING"),
        );
        await callback(first.id, a);
        await due(first.id);
        await engine.reconcileDue();
        expect((await engine.detail(first.id, a)).status).toBe("SUCCEEDED");
        expect((await engine.detail(second.id, a)).status).toBe("PENDING");
        expect((await engine.workspace(a)).testStatus).toBe("PENDING");
        expect(
          (await engine.workspace(a)).tests.map((row) => row.id),
        ).toContain(first.id);
        expect((await settings.getStore(a)).paymentAvailable).toBe(false);
      },
    );
    it("serializes concurrent fresh requests after expiry", async () => {
      const first = await start();
      await db.platformPaymentTest.update({
        where: { id: first.id },
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      const results = await Promise.allSettled([start(), start()]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(send).toHaveBeenCalledTimes(2);
      expect(
        await db.platformPaymentTest.count({ where: { organizationId: a } }),
      ).toBe(2);
    });
    it("requires production readiness and uses each Store's own live snapshot for QR, status and callback", async () => {
      await save(a, {
        environment: "PRODUCTION",
        dqrAccessConfirmed: false,
        providerId: "LIVE_PROVIDER_A",
      });
      await save(b, {
        environment: "PRODUCTION",
        dqrAccessConfirmed: false,
        providerId: "LIVE_PROVIDER_B",
      });
      await expect(start(a)).rejects.toMatchObject(
        error("PAYMENT_NOT_ENABLED"),
      );
      process.env.SELFX_PHONEPE_PRODUCTION_ENABLED = "true";
      await expect(start(a)).rejects.toMatchObject(
        error("PRODUCTION_ENDPOINT_UNCONFIGURED"),
      );
      expect(send).not.toHaveBeenCalled();
      // Fixture only, not a claim about the account's real production endpoint.
      const base = "https://fixture.phonepe.com/merchant";
      process.env.SELFX_PHONEPE_PRODUCTION_BASE_URL = base;
      process.env.SELFX_PHONEPE_UAT_ENABLED = "false";
      expect((await engine.workspace(a)).executionEnabled).toBe(true);
      const key = createSelfxId();
      const first = await start(a, key),
        second = await start(b, key);
      expect(first.environment).toBe("PRODUCTION");
      expect(first.testOnly).toBe(false);
      expect(first.qrString).toContain("upi://pay");
      for (const [index, storeId] of [a, b].entries()) {
        const request = send.mock.calls[index]![0];
        expect(request.url).toBe(base + "/v3/qr/init");
        expect(request.headers["X-PROVIDER-ID"]).toBe(
          index === 0 ? "LIVE_PROVIDER_A" : "LIVE_PROVIDER_B",
        );
        const encoded = JSON.parse(request.body!).request;
        expect(
          JSON.parse(Buffer.from(encoded, "base64").toString()).merchantId,
        ).toBe(merchant(storeId));
        expect(request.headers["X-VERIFY"]).toBe(
          createHash("sha256")
            .update(encoded + "/v3/qr/init" + salt)
            .digest("hex") + "###1",
        );
      }
      expect((await start(a, key)).id).toBe(first.id);
      expect(send).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(first)).not.toContain(salt);
      await expect(engine.detail(first.id, b)).rejects.toThrow();
      await expect(engine.detail(first.id)).rejects.toThrow();
      // Replacement must not alter the original merchant or production endpoint.
      await save(a, {
        environment: "UAT",
        merchantId: "NEW_UAT_MERCHANT",
        saltKey: "replacement-fixture-salt-key",
      });
      process.env.SELFX_PHONEPE_PRODUCTION_BASE_URL =
        "https://new-fixture.phonepe.com";
      await callback(first.id, a);
      await due(first.id);
      const checked = await engine.check(first.id, actor, a);
      expect(checked.status).toBe("SUCCEEDED");
      expect(send.mock.calls.at(-1)![0].url).toContain(
        base + "/v3/transaction/" + merchant(a),
      );
      expect((await engine.workspace(a)).testStatus).toBe("NOT_TESTED");
      expect((await settings.getStore(a)).paymentAvailable).toBe(false);
      const audits = await db.auditLog.findMany({
        where: { actorUserId: actor, resourceId: first.id },
      });
      expect(
        audits.some(
          (row) =>
            (row.metadata as { environment?: string }).environment ===
            "PRODUCTION",
        ),
      ).toBe(true);
      expect(JSON.stringify(audits)).not.toContain(salt);
      // The database also refuses to turn platform testing into live collection.
      await expect(
        db.platformPaymentTest.update({
          where: { id: second.id },
          data: { organizationId: null, scopeKey: "PLATFORM_TEST" },
        }),
      ).rejects.toThrow();
    });
    it("renews an expired production QR and preserves late verification", async () => {
      await save(a, { environment: "PRODUCTION", dqrAccessConfirmed: false });
      process.env.SELFX_PHONEPE_PRODUCTION_ENABLED = "true";
      process.env.SELFX_PHONEPE_PRODUCTION_BASE_URL =
        "https://fixture.phonepe.com";
      const first = await start();
      await expect(start()).rejects.toMatchObject(
        error("PAYMENT_TEST_PENDING"),
      );
      await db.platformPaymentTest.update({
        where: { id: first.id },
        data: { expiresAt: new Date(0) },
      });
      const second = await start();
      expect(second.id).not.toBe(first.id);
      expect((await engine.detail(first.id, a)).qrString).toBeNull();
      await callback(first.id, a);
      await due(first.id);
      expect((await engine.check(first.id, actor, a)).status).toBe("SUCCEEDED");
      expect((await engine.detail(second.id, a)).status).toBe("PENDING");
    });
    it.each(["UNCONFIRMED"] as const)(
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
