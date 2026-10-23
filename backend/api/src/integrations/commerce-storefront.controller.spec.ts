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
