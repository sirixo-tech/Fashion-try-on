import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { FastifyRequest } from "fastify";
import type { AuthService } from "../auth/auth.service.js";
import type { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import type { StoreRbacService } from "../rbac/store-rbac.service.js";
import type { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import type { KioskService } from "../kiosks/kiosk.service.js";
import {
  KioskOrderPaymentsController,
  StoreOrderPaymentsController,
} from "./order-payments.controller.js";
import { OrderPaymentsService } from "./order-payments.service.js";
import { PhonePeTransport } from "./phonepe.transport.js";
import { PaymentReconciliationService } from "./payment-reconciliation.service.js";
import type { PlatformPaymentTestsService } from "./platform-payment-tests.service.js";
import {
  PhonePeCallbackDto,
  StartOrderPaymentDto,
} from "./payment-execution.dto.js";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("payment execution validation", () => {
  it("validates replay keys and bounded callback envelopes", async () => {
    expect(
      await validate(
        plainToInstance(StartOrderPaymentDto, {
          idempotencyKey: "fixture-key-123",
        }),
      ),
    ).toHaveLength(0);
    for (const idempotencyKey of [
      undefined,
      "",
      "x",
      "x".repeat(101),
      "<script>",
    ])
      expect(
        (
          await validate(
            plainToInstance(StartOrderPaymentDto, { idempotencyKey }),
          )
        ).length,
      ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(PhonePeCallbackDto, { response: "x".repeat(32769) }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (await validate(plainToInstance(PhonePeCallbackDto, { response: "{}" })))
        .length,
    ).toBeGreaterThan(0);
  });
});
describe("payment transport without real network", () => {
  const request = {
    url: "https://mercury-uat.phonepe.com/enterprise-sandbox/v3/qr/init",
    method: "POST" as const,
    headers: { "X-VERIFY": "fixture_signature" },
    body: "fixture",
  };
  it("makes no requests while disabled or for a production/unapproved URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("SELFX_PHONEPE_UAT_ENABLED", "false");
    await expect(new PhonePeTransport().send(request)).rejects.toThrow();
    vi.stubEnv("SELFX_PHONEPE_UAT_ENABLED", "true");
    for (const url of [
      "https://evil.test/v3/qr/init",
      "https://mercury-t2.phonepe.com/v3/qr/init",
      "http://mercury-uat.phonepe.com/enterprise-sandbox/v3/qr/init",
    ])
      await expect(
        new PhonePeTransport().send({ ...request, url }),
      ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uses bounded timeout, disallows redirects and parses a valid response", async () => {
    vi.stubEnv("SELFX_PHONEPE_UAT_ENABLED", "true");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"code":"SUCCESS"}'));
    vi.stubGlobal("fetch", fetchMock);
    expect(await new PhonePeTransport().send(request)).toEqual({
      code: "SUCCESS",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      request.url,
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it.each([
    new Response("x".repeat(65537)),
    new Response("not json"),
    new Response("error", { status: 500 }),
  ])(
    "rejects oversized, malformed or failed responses without logging credentials",
    async (response) => {
      vi.stubEnv("SELFX_PHONEPE_UAT_ENABLED", "true");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(new PhonePeTransport().send(request)).rejects.toThrow(
        "PhonePe response unavailable or invalid.",
      );
    },
  );
});
describe("payment route authorization", () => {
  const request = {
    headers: { authorization: "Bearer fixture" },
  } as FastifyRequest;
  function setup() {
    const auth = {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "actor" }),
      },
      platform = { hasPermission: vi.fn().mockResolvedValue(false) };
    const rbac = {
        requireStorePermission: vi.fn().mockResolvedValue(undefined),
      },
      impersonation = { resolveStoreContext: vi.fn().mockResolvedValue({}) };
    const payments = { checkStaff: vi.fn(), retryAllocation: vi.fn() };
    return {
      auth,
      platform,
      rbac,
      impersonation,
      payments,
      controller: new StoreOrderPaymentsController(
        auth as unknown as AuthService,
        platform as unknown as PlatformAuthorizationService,
        rbac as unknown as StoreRbacService,
        impersonation as unknown as StoreImpersonationService,
        payments as unknown as OrderPaymentsService,
      ),
    };
  }
  it("requires scoped Store permission and attributes recovery/checks to the real actor", async () => {
    const c = setup();
    await c.controller.check(request, "store-a", "order-a", "attempt-a");
    expect(c.rbac.requireStorePermission).toHaveBeenCalledWith(
      "actor",
      "store-a",
      "stores.update",
    );
    expect(c.payments.checkStaff).toHaveBeenCalledWith(
      "store-a",
      "order-a",
      "attempt-a",
      "actor",
    );
    await c.controller.recover(request, "store-a", "order-a");
    expect(c.payments.retryAllocation).toHaveBeenCalledWith(
      "store-a",
      "order-a",
      "actor",
    );
  });
  it("denies access before a cross-Store check or recovery can execute", async () => {
    const c = setup();
    c.rbac.requireStorePermission.mockRejectedValue(new Error("denied"));
    await expect(
      c.controller.check(request, "store-b", "order-b", "attempt-b"),
    ).rejects.toThrow();
    await expect(
      c.controller.recover(request, "store-b", "order-b"),
    ).rejects.toThrow();
    expect(c.payments.checkStaff).not.toHaveBeenCalled();
    expect(c.payments.retryAllocation).not.toHaveBeenCalled();
  });
  it("uses device authentication rather than staff identity for initiating a payment", async () => {
    const kiosks = {
        requireDevice: vi.fn().mockRejectedValue(new Error("device required")),
      },
      payments = { start: vi.fn() };
    const controller = new KioskOrderPaymentsController(
      kiosks as unknown as KioskService,
      payments as unknown as OrderPaymentsService,
    );
    await expect(
      controller.start(request, "session-a", "order-a", {
        idempotencyKey: "fixture-key",
      }),
    ).rejects.toThrow();
    expect(payments.start).not.toHaveBeenCalled();
  });
});
it("reconciliation timer does not overlap and resumes after a failed batch", async () => {
  let release!: () => void;
  const payments = {
    reconcileDue: vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue(0),
  };
  const worker = new PaymentReconciliationService(
    payments as unknown as OrderPaymentsService,
    {
      reconcileDue: vi.fn().mockResolvedValue(0),
    } as unknown as PlatformPaymentTestsService,
  );
  const first = worker.tick();
  await worker.tick();
  expect(payments.reconcileDue).toHaveBeenCalledTimes(1);
  release();
  await first;
  await worker.tick();
  expect(payments.reconcileDue).toHaveBeenCalledTimes(2);
  const warning = vi
    .spyOn(
      (worker as unknown as { logger: { warn: (message: string) => void } })
        .logger,
      "warn",
    )
    .mockImplementation(() => undefined);
  payments.reconcileDue.mockRejectedValueOnce(
    new Error("database unavailable"),
  );
  await worker.tick();
  await worker.tick();
  expect(payments.reconcileDue).toHaveBeenCalledTimes(4);
  warning.mockRestore();
});
