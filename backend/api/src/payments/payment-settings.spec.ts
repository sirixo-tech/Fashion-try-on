import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import type { FastifyRequest } from "fastify";
import type { AuthService } from "../auth/auth.service.js";
import type { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import type { StoreRbacService } from "../rbac/store-rbac.service.js";
import type { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import {
  PlatformPaymentGatewaysController,
  StorePaymentSettingsController,
} from "./payment-settings.controller.js";
import {
  SavePhonePeConnectionDto,
  SelectPaymentGatewayDto,
  EditPhonePeConnectionDto,
} from "./payment-settings.dto.js";
import {
  paymentEncryptionKey,
  PaymentSettingsService,
} from "./payment-settings.service.js";
const input: SavePhonePeConnectionDto = {
  expectedVersion: 0,
  environment: "UNCONFIRMED",
  merchantId: "fixture_mid",
  saltIndex: "1",
  saltKey: "fixture-not-a-real-salt-key",
};
const request = {
  headers: { authorization: "Bearer fixture" },
} as FastifyRequest;
describe("payment configuration input and encryption readiness", () => {
  it("accepts unconfirmed environment without pretending account access was verified", async () => {
    expect(
      await validate(plainToInstance(SavePhonePeConnectionDto, input)),
    ).toHaveLength(0);
  });
  it("permits an absent/blank edit Salt Key but rejects malformed replacements and missing create keys", async () => {
    for (const saltKey of [undefined, "", "valid-replacement-fixture-key"])
      expect(
        await validate(
          plainToInstance(EditPhonePeConnectionDto, { ...input, saltKey }),
        ),
      ).toHaveLength(0);
    for (const saltKey of [null, " ", "too-short", "key-with-newline-123\n"])
      expect(
        (
          await validate(
            plainToInstance(EditPhonePeConnectionDto, { ...input, saltKey }),
          )
        ).length,
      ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(SavePhonePeConnectionDto, {
            ...input,
            saltKey: undefined,
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it.each([
    { environment: null },
    { environment: "https://evil.test" },
    { saltKey: null },
    { saltKey: "" },
    { merchantId: "../other" },
    { providerId: null },
    { saltIndex: "1\r\nX:bad" },
  ])("rejects malformed credentials: %j", async (override) => {
    expect(
      (
        await validate(
          plainToInstance(SavePhonePeConnectionDto, { ...input, ...override }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it("accepts explicit clearing and rejects missing or invented provider selection", async () => {
    expect(
      await validate(
        plainToInstance(SelectPaymentGatewayDto, {
          expectedVersion: 0,
          provider: null,
        }),
      ),
    ).toHaveLength(0);
    for (const provider of [undefined, "EVIL"])
      expect(
        (
          await validate(
            plainToInstance(SelectPaymentGatewayDto, {
              expectedVersion: 0,
              provider,
            }),
          )
        ).length,
      ).toBeGreaterThan(0);
  });
  it("requires a valid dedicated server key; configuration does not fall back to plaintext", () => {
    expect(() => paymentEncryptionKey({})).toThrow();
    expect(() =>
      paymentEncryptionKey({ SELFX_PAYMENT_ENCRYPTION_KEY: "invalid" }),
    ).toThrow();
    expect(
      paymentEncryptionKey({
        SELFX_PAYMENT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      }).key,
    ).toHaveLength(32);
  });
});
describe("payment configuration authorization", () => {
  function setup(impersonating = false, platformAccess = false) {
    const auth = {
      requireAccessUser: vi.fn().mockResolvedValue({ id: "actor" }),
    };
    const platform = {
      hasPermission: vi.fn().mockResolvedValue(platformAccess),
    };
    const rbac = {
      requireStorePaymentPermission: vi.fn().mockResolvedValue(undefined),
    };
    const impersonation = {
      resolveStoreContext: vi
        .fn()
        .mockResolvedValue({ impersonationSession: impersonating ? {} : null }),
      currentSession: vi
        .fn()
        .mockResolvedValue({ session: impersonating ? {} : null }),
    };
    const payments = {
      getStore: vi.fn(),
      savePhonePe: vi.fn(),
      select: vi.fn(),
      listGateways: vi.fn(),
      updatePolicy: vi.fn(),
      getPhonePeEdit: vi.fn(),
      editPhonePe: vi.fn(),
      deletePhonePe: vi.fn(),
    };
    return {
      auth,
      platform,
      rbac,
      impersonation,
      payments,
      store: new StorePaymentSettingsController(
        auth as unknown as AuthService,
        rbac as unknown as StoreRbacService,
        impersonation as unknown as StoreImpersonationService,
        payments as unknown as PaymentSettingsService,
      ),
      admin: new PlatformPaymentGatewaysController(
        auth as unknown as AuthService,
        platform as unknown as PlatformAuthorizationService,
        impersonation as unknown as StoreImpersonationService,
        payments as unknown as PaymentSettingsService,
      ),
    };
  }
  it("requires explicit tenant permissions and attributes changes to the real user", async () => {
    const c = setup();
    await c.store.save(request, "store-a", input);
    expect(c.rbac.requireStorePaymentPermission).toHaveBeenCalledWith(
      "actor",
      "store-a",
      true,
    );
    expect(c.payments.savePhonePe).toHaveBeenCalledWith(
      "store-a",
      "actor",
      input,
    );
  });
  it("requires actual Store management permission for editable details, updates and deletion", async () => {
    const c = setup();
    await c.store.editDetails(request, "store-a");
    await c.store.edit(request, "store-a", { ...input, saltKey: "" });
    await c.store.remove(request, "store-a", { expectedVersion: 3 });
    expect(c.payments.getPhonePeEdit).toHaveBeenCalledWith("store-a");
    expect(c.payments.editPhonePe).toHaveBeenCalledWith(
      "store-a",
      "actor",
      expect.objectContaining({ saltKey: "" }),
    );
    expect(c.payments.deletePhonePe).toHaveBeenCalledWith("store-a", "actor", {
      expectedVersion: 3,
    });
    expect(
      c.rbac.requireStorePaymentPermission.mock.calls.every(
        (call) => call[2] === true,
      ),
    ).toBe(true);
  });
  it.each(["editDetails", "edit", "remove"] as const)(
    "denies %s for unauthorized stores or impersonation",
    async (action) => {
      const denied = setup();
      denied.rbac.requireStorePaymentPermission.mockRejectedValue(
        new Error("denied"),
      );
      const invoke = (c: ReturnType<typeof setup>) =>
        action === "editDetails"
          ? c.store.editDetails(request, "store-b")
          : action === "edit"
            ? c.store.edit(request, "store-b", input)
            : c.store.remove(request, "store-b", { expectedVersion: 0 });
      await expect(invoke(denied)).rejects.toThrow();
      const impersonating = setup(true, true);
      await expect(invoke(impersonating)).rejects.toThrow();
      for (const c of [denied, impersonating]) {
        expect(c.payments.getPhonePeEdit).not.toHaveBeenCalled();
        expect(c.payments.editPhonePe).not.toHaveBeenCalled();
        expect(c.payments.deletePhonePe).not.toHaveBeenCalled();
      }
    },
  );
  it("denies unauthorized requests before calling payment services", async () => {
    const c = setup();
    c.rbac.requireStorePaymentPermission.mockRejectedValue(new Error("denied"));
    await expect(c.store.get(request, "store-b")).rejects.toThrow("denied");
    expect(c.payments.getStore).not.toHaveBeenCalled();
    await expect(
      c.admin.update(request, "PHONEPE", { expectedVersion: 0, enabled: true }),
    ).rejects.toThrow();
    expect(c.payments.updatePolicy).not.toHaveBeenCalled();
  });
  it("blocks credential/selection mutation during impersonation even for platform admins", async () => {
    const c = setup(true, true);
    await expect(c.store.save(request, "store-a", input)).rejects.toThrow();
    await expect(
      c.store.select(request, "store-a", {
        expectedVersion: 0,
        provider: null,
      }),
    ).rejects.toThrow();
    await expect(c.admin.list(request)).rejects.toThrow();
    expect(c.payments.savePhonePe).not.toHaveBeenCalled();
    expect(c.payments.select).not.toHaveBeenCalled();
    await c.store.get(request, "store-a");
    expect(c.payments.getStore).toHaveBeenCalledWith("store-a");
  });
  it("does not turn platform integration authority into Store credential access", async () => {
    const c = setup(false, true);
    c.rbac.requireStorePaymentPermission.mockRejectedValue(
      new Error("No Store Admin membership"),
    );
    await expect(c.store.save(request, "store-a", input)).rejects.toThrow(
      "No Store Admin membership",
    );
    await expect(
      c.store.select(request, "store-a", {
        expectedVersion: 0,
        provider: "PHONEPE",
      }),
    ).rejects.toThrow();
    expect(c.payments.savePhonePe).not.toHaveBeenCalled();
    expect(c.payments.select).not.toHaveBeenCalled();
  });
});
