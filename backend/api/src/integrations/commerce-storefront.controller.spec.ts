import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { ValidationPipe } from "@nestjs/common";
import {
  WooCommerceStorefrontController,
  CommerceStorefrontController,
} from "./commerce-storefront.controller.js";
import { INTEGRATION_SCOPES_METADATA } from "./integration-token.constants.js";
import { IntegrationTokenGuard } from "./integration-token.guard.js";
import {
  WooCommerceLaunchDto,
  StorefrontConsentDto,
} from "./dto/commerce-storefront.dto.js";
describe("Commerce storefront boundary", () => {
  it("issues a secure HttpOnly first-party marker and reuses it on another launch", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const bindFirstPartyVisitor = vi
        .fn()
        .mockResolvedValue({ bound: true, cookieRequired: true });
      const controller = new CommerceStorefrontController({
        bindFirstPartyVisitor,
      } as never);
      const reply = { header: vi.fn(), setCookie: vi.fn() };
      await controller.visitor(
        { session: "s".repeat(43) },
        { cookies: {} } as never,
        reply as never,
      );
      const [name, token, options] = reply.setCookie.mock.calls[0]!;
      expect(name).toBe("__Host-selfx_storefront_visitor");
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(options).toMatchObject({
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
      reply.setCookie.mockClear();
      await controller.visitor(
        { session: "t".repeat(43) },
        { cookies: { [name]: token } } as never,
        reply as never,
      );
      expect(bindFirstPartyVisitor).toHaveBeenLastCalledWith(
        "t".repeat(43),
        token,
      );
      expect(reply.setCookie).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("does not replace the visitor cookie if binding fails", async () => {
    const reply = { header: vi.fn(), setCookie: vi.fn() };
    const controller = new CommerceStorefrontController({
      bindFirstPartyVisitor: vi
        .fn()
        .mockRejectedValue(new Error("invalid launch")),
    } as never);
    await expect(
      controller.visitor(
        { session: "s".repeat(43) },
        { cookies: {} } as never,
        reply as never,
      ),
    ).rejects.toThrow();
    expect(reply.setCookie).not.toHaveBeenCalled();
  });
  it("keeps WooCommerce's existing visitor identity without adding a SelfX cookie", async () => {
    const reply = { header: vi.fn(), setCookie: vi.fn() };
    const controller = new CommerceStorefrontController({
      bindFirstPartyVisitor: vi
        .fn()
        .mockResolvedValue({ bound: true, cookieRequired: false }),
    } as never);
    await expect(
      controller.visitor(
        { session: "s".repeat(43) },
        { cookies: {} } as never,
        reply as never,
      ),
    ).resolves.toEqual({ bound: true });
    expect(reply.setCookie).not.toHaveBeenCalled();
  });
  it("requires integration Try-On scope for launch and eligibility", () => {
    for (const method of ["launch", "availability"] as const) {
      const handler = WooCommerceStorefrontController.prototype[method];
      expect(Reflect.getMetadata(INTEGRATION_SCOPES_METADATA, handler)).toEqual(
        ["tryon:create"],
      );
      expect(Reflect.getMetadata("__guards__", handler)).toContain(
        IntegrationTokenGuard,
      );
    }
  });
  it("rejects client-supplied Store, return URL and unaccepted consent", async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    for (const extra of [
      { storeId: "other" },
      { returnUrl: "https://evil.example" },
    ]) {
      await expect(
        pipe.transform(
          { externalProductId: "10", visitorToken: "v".repeat(43), ...extra },
          { type: "body", metatype: WooCommerceLaunchDto },
        ),
      ).rejects.toThrow();
    }
    await expect(
      pipe.transform(
        { accepted: false, policyVersion: "selfx-photo-2026-10-23" },
        { type: "body", metatype: StorefrontConsentDto },
      ),
    ).rejects.toThrow();
  });
  it("checks consent before reading photo bytes", async () => {
    const requirePhotoConsent = vi
      .fn()
      .mockRejectedValue(new Error("consent required"));
    const request = { parts: vi.fn() };
    await expect(
      new CommerceStorefrontController({ requirePhotoConsent } as never).upload(
        { session: "s" },
        request as never,
      ),
    ).rejects.toThrow("consent required");
    expect(request.parts).not.toHaveBeenCalled();
  });
  it("launches only on the configured SelfX site with a fragment capability", async () => {
    vi.stubEnv("SELFX_WEB_BASE_URL", "https://selfx.example");
    try {
      const createWooCommerceSession = vi
        .fn()
        .mockResolvedValue({ session: "s".repeat(43), expiresAt: "later" });
      const result = await new WooCommerceStorefrontController({
        createWooCommerceSession,
      } as never).launch({} as never, {
        externalProductId: "10",
        visitorToken: "v".repeat(43),
      });
      expect(result.launchUrl).toBe(
        `https://selfx.example/try-on/commerce#session=${"s".repeat(43)}`,
      );
      expect(new URL(result.launchUrl).search).toBe("");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
