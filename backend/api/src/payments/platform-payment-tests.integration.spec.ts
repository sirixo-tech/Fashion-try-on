import "reflect-metadata";
import { createHash } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { encryptProviderSecret } from "../integrations/provider-secret-cipher.js";
import {
  PlatformPaymentTestsService,
  platformTestAdapter,
} from "./platform-payment-tests.service.js";
import { PhonePeTransport } from "./phonepe.transport.js";
import type { ProviderRequest } from "./payment-adapter.js";
import type { SavePlatformPhonePeTestDto } from "./platform-payment-tests.dto.js";

const url = process.env.PAYMENT_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test"))
)
  throw new Error("Disposable localhost test database required.");
const salt = "fixture-platform-salt-not-real";
async function code(promise: Promise<unknown>, expected: string) {
  await expect(
    promise.catch((error: ApiErrorException) => error.getResponse()),
  ).resolves.toMatchObject({ error: { code: expected } });
}
describe.skipIf(!url)(
  "Platform PhonePe UAT testing, isolated PostgreSQL and simulated transport",
  () => {
    const db = new PrismaService({
      datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
    });
    const send = vi.fn<(request: ProviderRequest) => Promise<unknown>>();
    const service = new PlatformPaymentTestsService(db, {
      send,
    } as unknown as PhonePeTransport);
    const actor = createSelfxId(),
      otherActor = createSelfxId();
    const previous = new Map<string, string | undefined>();
    beforeAll(async () => {
      for (const [name, value] of Object.entries({
        SELFX_PAYMENT_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
        SELFX_PAYMENT_ENCRYPTION_KEY_VERSION: "platform_fixture_v1",
        SELFX_PHONEPE_UAT_ENABLED: "true",
        SELFX_PAYMENT_CALLBACK_BASE_URL: "https://callbacks.example.test",
      })) {
        previous.set(name, process.env[name]);
        process.env[name] = value;
      }
      await db.$connect();
      await db.user.createMany({
        data: [actor, otherActor].map((id) => ({
          id,
          email: `${id}@platform-test.invalid`,
          passwordHash: "not-a-login",
        })),
      });
    });
    beforeEach(async () => {
      await db.platformPaymentTestEvent.deleteMany();
      await db.platformPaymentTest.deleteMany();
      await db.platformPaymentTestConnection.deleteMany();
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
        return evidence(row);
      });
      await save();
    });
    afterAll(async () => {
      await db.platformPaymentTestEvent.deleteMany();
      await db.platformPaymentTest.deleteMany();
      await db.platformPaymentTestConnection.deleteMany();
      await db.auditLog.deleteMany({
        where: { actorUserId: { in: [actor, otherActor] } },
      });
      await db.auditLog.deleteMany({
        where: { resourceType: "platform_payment_test" },
      });
      await db.user.deleteMany({ where: { id: { in: [actor, otherActor] } } });
      await db.$disconnect();
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    });
    async function save(overrides: Partial<SavePlatformPhonePeTestDto> = {}) {
      const connection = await db.platformPaymentTestConnection.findUnique({
        where: { provider: "PHONEPE" },
      });
      return service.save(actor, {
        expectedVersion: connection?.version ?? 0,
        environment: "UAT",
        dqrAccessConfirmed: true,
        merchantId: "fixture_platform_mid",
        saltIndex: "1",
        saltKey: salt,
        ...overrides,
      });
    }
    async function start(key = createSelfxId(), user = actor) {
      return service.start(user, {
        expectedVersion: (await service.workspace()).connection!.version,
        idempotencyKey: key,
      });
    }
    async function due(id: string) {
      await db.platformPaymentTest.update({
        where: { id },
        data: { leaseUntil: null, nextCheckAt: new Date(0) },
      });
    }
    async function reconcile(id: string) {
      await due(id);
      await service.reconcile(id, actor);
    }
    function evidence(
      row: { transactionId: string; amountMinor: number },
      paymentCode = "PAYMENT_SUCCESS",
      merchantId = "fixture_platform_mid",
    ) {
      return {
        success: paymentCode === "PAYMENT_SUCCESS",
        code: paymentCode,
        data: {
          merchantId,
          transactionId: row.transactionId,
          amount: row.amountMinor,
          paymentState:
            paymentCode === "PAYMENT_SUCCESS"
              ? "COMPLETED"
              : paymentCode === "PAYMENT_ERROR"
                ? "FAILED"
                : "PENDING",
          providerReferenceId: `REF_${row.transactionId}`,
        },
      };
    }
    async function notification(id: string, response?: unknown) {
      const row = await db.platformPaymentTest.findUniqueOrThrow({
        where: { id },
      });
      const encoded = Buffer.from(
        JSON.stringify(response ?? evidence(row)),
      ).toString("base64");
      return {
        encoded,
        signature:
          createHash("sha256")
            .update(encoded + salt)
            .digest("hex") + "###1",
      };
    }
    it("encrypts isolated credentials, omits secrets and requires explicit UAT", async () => {
      const raw = await db.platformPaymentTestConnection.findUniqueOrThrow({
        where: { provider: "PHONEPE" },
      });
      expect(raw.encryptedPayload).not.toContain(salt);
      const safe = JSON.stringify(await service.workspace());
      for (const value of [
        salt,
        "fixture_platform_mid",
        "encryptedPayload",
        "initializationVector",
      ])
        expect(safe).not.toContain(value);
      await code(
        save({ environment: "PRODUCTION" as "UAT" }),
        "PAYMENT_TEST_UAT_REQUIRED",
      );
      expect((await service.workspace()).testStatus).toBe("NOT_TESTED");
    });
    it("serializes concurrent credential replacement and resets confirmation", async () => {
      const v = (await service.workspace()).connection!.version;
      const attempts = await Promise.allSettled([
        save({ expectedVersion: v }),
        save({ expectedVersion: v }),
      ]);
      expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      await save({ dqrAccessConfirmed: undefined });
      expect((await service.workspace()).connection?.dqrAccessConfirmed).toBe(
        false,
      );
    });
    it("creates one durable test and one QR call under concurrent replay", async () => {
      const key = createSelfxId();
      const [a, b] = await Promise.all([start(key), start(key)]);
      expect(a.id).toBe(b.id);
      expect(send).toHaveBeenCalledTimes(1);
      expect(a).toMatchObject({
        amountMinor: 100,
        currency: "INR",
        environment: "UAT",
        testOnly: true,
        status: "PENDING",
      });
      const request = send.mock.calls[0]![0];
      expect(request.headers["X-CALLBACK-URL"]).toContain(
        `/platform-tests/${a.id}/callback`,
      );
      expect(JSON.stringify(a)).not.toContain(salt);
    });
    it("prevents overlapping tests across platform users for the same account version", async () => {
      await start();
      await code(start(undefined, otherActor), "PAYMENT_TEST_PENDING");
      expect(send).toHaveBeenCalledTimes(1);
    });
    it("blocks disabled execution, unconfirmed access and missing callback setup before network calls", async () => {
      process.env.SELFX_PHONEPE_UAT_ENABLED = "false";
      await code(start(), "PAYMENT_NOT_ENABLED");
      process.env.SELFX_PHONEPE_UAT_ENABLED = "true";
      await save({ dqrAccessConfirmed: false });
      await code(start(), "PAYMENT_ACCOUNT_UNCONFIRMED");
      await save();
      process.env.SELFX_PAYMENT_CALLBACK_BASE_URL = "http://localhost";
      await code(start(), "PAYMENT_CALLBACK_UNCONFIGURED");
      expect(send).not.toHaveBeenCalled();
    });
    it("rejects stale setup revisions without starting a test", async () => {
      await code(
        service.start(actor, {
          expectedVersion: 0,
          idempotencyKey: createSelfxId(),
        }),
        "PAYMENT_SETTINGS_CHANGED",
      );
      expect(send).not.toHaveBeenCalled();
    });
    it("authenticates and deduplicates callbacks without declaring success from notification alone", async () => {
      const test = await start(),
        n = await notification(test.id);
      await code(
        service.callback(test.id, n.encoded, "bad", "fixture-ip"),
        "PAYMENT_CALLBACK_INVALID",
      );
      await Promise.all([
        service.callback(test.id, n.encoded, n.signature, "fixture-ip"),
        service.callback(test.id, n.encoded, n.signature, "fixture-ip"),
      ]);
      expect(
        await db.platformPaymentTestEvent.count({ where: { testId: test.id } }),
      ).toBe(1);
      expect(await service.detail(test.id)).toMatchObject({
        status: "PENDING",
        callbackReceived: true,
      });
      await service.reconcile(test.id);
      expect(await service.detail(test.id)).toMatchObject({
        status: "SUCCEEDED",
        qrString: null,
      });
      expect((await service.workspace()).testStatus).toBe("PASSED");
    });
    it("rejects signed merchant or amount mismatches", async () => {
      const test = await start(),
        row = await db.platformPaymentTest.findUniqueOrThrow({
          where: { id: test.id },
        });
      for (const response of [
        evidence(row, "PAYMENT_SUCCESS", "wrong_mid"),
        evidence({ ...row, amountMinor: 200 }),
      ]) {
        const n = await notification(test.id, response);
        await code(
          service.callback(test.id, n.encoded, n.signature, "fixture-ip"),
          "PAYMENT_CALLBACK_INVALID",
        );
      }
      expect(await db.platformPaymentTestEvent.count()).toBe(0);
    });
    it("preserves an uncertain initialization and never resends it on replay, including restart", async () => {
      send.mockRejectedValueOnce(new Error("simulated init timeout"));
      const key = createSelfxId(),
        test = await start(key);
      expect(test.status).toBe("UNKNOWN");
      const restarted = new PlatformPaymentTestsService(db, {
        send,
      } as unknown as PhonePeTransport);
      expect(
        (
          await restarted.start(actor, {
            expectedVersion: 1,
            idempotencyKey: key,
          })
        ).id,
      ).toBe(test.id);
      expect(send).toHaveBeenCalledTimes(1);
      await due(test.id);
      await restarted.reconcileDue();
      expect((await service.detail(test.id)).status).toBe("SUCCEEDED");
    });
    it("hides expired QR but keeps pending verification and accepts late success", async () => {
      const test = await start();
      await db.platformPaymentTest.update({
        where: { id: test.id },
        data: { expiresAt: new Date(0) },
      });
      expect(await service.detail(test.id)).toMatchObject({
        status: "PENDING",
        qrString: null,
      });
      await code(start(), "PAYMENT_TEST_PENDING");
      await reconcile(test.id);
      expect((await service.detail(test.id)).status).toBe("SUCCEEDED");
    });
    it("keeps network, unknown and mismatched status responses unresolved", async () => {
      const test = await start(),
        row = await db.platformPaymentTest.findUniqueOrThrow({
          where: { id: test.id },
        });
      for (const response of [
        evidence(row, "UNRECOGNIZED"),
        evidence({ ...row, amountMinor: 999 }),
      ]) {
        send.mockResolvedValueOnce(response);
        await reconcile(test.id);
        expect((await service.detail(test.id)).status).toBe("UNKNOWN");
      }
      send.mockRejectedValueOnce(new Error("fixture timeout"));
      await reconcile(test.id);
      expect((await service.detail(test.id)).failureCode).toBe(
        "PAYMENT_STATUS_UNAVAILABLE",
      );
      await code(start(), "PAYMENT_TEST_PENDING");
    });
    it("allows a new test after verified failure without losing a later success of the old test", async () => {
      const first = await start(),
        row = await db.platformPaymentTest.findUniqueOrThrow({
          where: { id: first.id },
        });
      send.mockResolvedValueOnce(evidence(row, "PAYMENT_ERROR"));
      await reconcile(first.id);
      expect((await service.detail(first.id)).status).toBe("FAILED");
      const second = await start();
      await reconcile(first.id);
      expect((await service.detail(first.id)).status).toBe("SUCCEEDED");
      expect((await service.detail(second.id)).status).toBe("PENDING");
    });
    it("retains verification and blocks new tests on conflicting signed success evidence", async () => {
      const test = await start(),
        row = await db.platformPaymentTest.findUniqueOrThrow({
          where: { id: test.id },
        });
      const n = await notification(test.id);
      await service.callback(test.id, n.encoded, n.signature, "fixture-ip");
      send.mockResolvedValueOnce(evidence(row, "PAYMENT_ERROR"));
      await reconcile(test.id);
      expect(await service.detail(test.id)).toMatchObject({
        status: "UNKNOWN",
        failureCode: "PAYMENT_EVIDENCE_CONFLICT",
      });
      await code(start(), "PAYMENT_TEST_PENDING");
      await reconcile(test.id);
      expect((await service.detail(test.id)).status).toBe("SUCCEEDED");
    });
    it("does not discard a late callback during a failed-attempt status timeout", async () => {
      const test = await start(),
        row = await db.platformPaymentTest.findUniqueOrThrow({
          where: { id: test.id },
        });
      send.mockResolvedValueOnce(evidence(row, "PAYMENT_ERROR"));
      await reconcile(test.id);
      const n = await notification(test.id);
      send.mockImplementationOnce(async () => {
        await service.callback(test.id, n.encoded, n.signature, "fixture-ip");
        throw new Error("simulated timeout");
      });
      await reconcile(test.id);
      expect((await service.detail(test.id)).nextCheckAt).not.toBeNull();
      await code(start(), "PAYMENT_TEST_PENDING");
      await due(test.id);
      await service.reconcileDue();
      expect((await service.detail(test.id)).status).toBe("SUCCEEDED");
    });
    it("keeps original encrypted credentials after replacement and resets the current account result", async () => {
      const test = await start();
      await reconcile(test.id);
      await save({ merchantId: "replacement_mid" });
      expect((await service.workspace()).testStatus).toBe("NOT_TESTED");
      const row = await db.platformPaymentTest.findUniqueOrThrow({
        where: { id: test.id },
      });
      expect(
        platformTestAdapter(row).statusRequest({
          transactionId: row.transactionId,
          amountMinor: 100,
          currency: "INR",
        }).url,
      ).toContain("fixture_platform_mid");
    });
    it("recovers expired leases and never downgrades confirmed success", async () => {
      const test = await start();
      await db.platformPaymentTest.update({
        where: { id: test.id },
        data: {
          leaseUntil: new Date(Date.now() + 30000),
          nextCheckAt: new Date(0),
        },
      });
      send.mockClear();
      await service.reconcile(test.id);
      expect(send).not.toHaveBeenCalled();
      await due(test.id);
      await service.reconcileDue();
      send.mockRejectedValueOnce(new Error("must not execute"));
      await reconcile(test.id);
      expect((await service.detail(test.id)).status).toBe("SUCCEEDED");
    });
    it("records callback delivery even when it arrives after successful verification", async () => {
      const test = await start();
      await reconcile(test.id);
      expect((await service.detail(test.id)).callbackReceived).toBe(false);
      const n = await notification(test.id);
      await service.callback(test.id, n.encoded, n.signature, "fixture-ip");
      expect((await service.detail(test.id)).callbackReceived).toBe(true);
    });
    it("does not create merchant tenants, orders, reservations or stock changes", async () => {
      const counts = async () =>
        Promise.all([
          db.organization.count(),
          db.shoppingOrder.count(),
          db.productVariant.count(),
          db.storePaymentConnection.count(),
        ]);
      const before = await counts(),
        test = await start();
      await reconcile(test.id);
      expect(await counts()).toEqual(before);
      const history = JSON.stringify(await service.workspace());
      expect(history).not.toContain("qrString");
      expect(history).not.toContain("createdById");
      expect(history).not.toContain("transactionId");
    });
    it("rejects a Store credential payload in the platform test scope", async () => {
      const encrypted = encryptProviderSecret(
        {
          organizationId: createSelfxId(),
          provider: "PHONEPE",
          environment: "UAT",
          merchantId: "fixture_platform_mid",
          providerStoreId: "fixture_store",
          saltIndex: "1",
          saltKey: salt,
        },
        Buffer.alloc(32, 9),
      );
      expect(() =>
        platformTestAdapter({
          ...encrypted,
          provider: "PHONEPE",
          environment: "UAT",
          keyVersion: "platform_fixture_v1",
        }),
      ).toThrow("Platform test snapshot mismatch");
    });
    it("reconciles an old test snapshot after a planned encryption key rotation", async () => {
      const test = await start();
      const key = process.env.SELFX_PAYMENT_ENCRYPTION_KEY,
        version = process.env.SELFX_PAYMENT_ENCRYPTION_KEY_VERSION,
        previousKeys = process.env.SELFX_PAYMENT_PREVIOUS_ENCRYPTION_KEYS;
      try {
        process.env.SELFX_PAYMENT_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString(
          "base64",
        );
        process.env.SELFX_PAYMENT_ENCRYPTION_KEY_VERSION =
          "rotated_platform_fixture";
        process.env.SELFX_PAYMENT_PREVIOUS_ENCRYPTION_KEYS = JSON.stringify({
          platform_fixture_v1: key,
        });
        await reconcile(test.id);
        expect((await service.detail(test.id)).status).toBe("SUCCEEDED");
      } finally {
        process.env.SELFX_PAYMENT_ENCRYPTION_KEY = key;
        process.env.SELFX_PAYMENT_ENCRYPTION_KEY_VERSION = version;
        if (previousKeys === undefined)
          delete process.env.SELFX_PAYMENT_PREVIOUS_ENCRYPTION_KEYS;
        else process.env.SELFX_PAYMENT_PREVIOUS_ENCRYPTION_KEYS = previousKeys;
      }
    });
  },
);
