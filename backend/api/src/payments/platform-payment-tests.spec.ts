import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { FastifyRequest } from "fastify";
import type { AuthService } from "../auth/auth.service.js";
import type { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import type { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import type { PlatformPaymentTestsService } from "./platform-payment-tests.service.js";
import { PlatformPaymentTestsController } from "./platform-payment-tests.controller.js";
import {
  SavePlatformPhonePeTestDto,
  StartPlatformPaymentTestDto,
} from "./platform-payment-tests.dto.js";
const request = {
  headers: { authorization: "Bearer fixture" },
} as FastifyRequest;
function setup() {
  const auth = {
      requireAccessUser: vi.fn().mockResolvedValue({ id: "actual-actor" }),
    },
    platform = { hasPermission: vi.fn().mockResolvedValue(true) },
    impersonation = {
      currentSession: vi.fn().mockResolvedValue({ session: null }),
    },
    tests = {
      workspace: vi.fn(),
      save: vi.fn(),
      start: vi.fn(),
      detail: vi.fn(),
      check: vi.fn(),
    };
  return {
    platform,
    impersonation,
    tests,
    controller: new PlatformPaymentTestsController(
      auth as unknown as AuthService,
      platform as unknown as PlatformAuthorizationService,
      impersonation as unknown as StoreImpersonationService,
      tests as unknown as PlatformPaymentTestsService,
    ),
  };
}
describe("platform payment testing boundary", () => {
  it("requires platform view permission for metadata and manage permission for QR operations", async () => {
    const c = setup();
    await c.controller.workspace(request);
    expect(c.platform.hasPermission).toHaveBeenLastCalledWith(
      "actual-actor",
      "INTEGRATIONS_VIEW",
    );
    await c.controller.detail(request, "test-id");
    expect(c.platform.hasPermission).toHaveBeenLastCalledWith(
      "actual-actor",
      "INTEGRATIONS_MANAGE",
    );
    await c.controller.check(request, "test-id");
    expect(c.tests.check).toHaveBeenCalledWith("test-id", "actual-actor");
  });
  it("does not grant Store managers access or invoke services after denied platform permission", async () => {
    const c = setup();
    c.platform.hasPermission.mockResolvedValue(false);
    await expect(c.controller.workspace(request)).rejects.toThrow();
    await expect(
      c.controller.start(request, {
        expectedVersion: 1,
        idempotencyKey: "fixture-key",
      }),
    ).rejects.toThrow();
    expect(c.tests.workspace).not.toHaveBeenCalled();
    expect(c.tests.start).not.toHaveBeenCalled();
  });
  it("blocks platform testing while impersonating a Store", async () => {
    const c = setup();
    c.impersonation.currentSession.mockResolvedValue({
      session: { id: "fixture" },
    } as never);
    await expect(c.controller.workspace(request)).rejects.toThrow();
    await expect(c.controller.check(request, "test-id")).rejects.toThrow();
    expect(c.tests.check).not.toHaveBeenCalled();
  });
  it("validates UAT-only credentials and rejects client amounts or tenant fields", async () => {
    const input = {
      expectedVersion: 0,
      environment: "UAT",
      merchantId: "fixture_mid",
      saltIndex: "1",
      saltKey: "fixture-key-not-real",
    };
    expect(
      await validate(plainToInstance(SavePlatformPhonePeTestDto, input)),
    ).toHaveLength(0);
    for (const environment of ["UNCONFIRMED", "PRODUCTION"])
      expect(
        (
          await validate(
            plainToInstance(SavePlatformPhonePeTestDto, {
              ...input,
              environment,
            }),
          )
        ).length,
      ).toBeGreaterThan(0);
    const invalid = plainToInstance(StartPlatformPaymentTestDto, {
      expectedVersion: 1,
      idempotencyKey: "fixture-key",
      amountMinor: 999,
      organizationId: "forged",
    });
    expect(
      (await validate(invalid, { whitelist: true, forbidNonWhitelisted: true }))
        .length,
    ).toBeGreaterThan(0);
  });
});
