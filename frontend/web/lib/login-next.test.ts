import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveLoginNextPath, safeLoginNextPath } from "@/lib/login-next";
import { getCurrentPlatformAccess } from "./access-control";
import {
  getCurrentMerchantStoreAccess,
  type CurrentStoreAccess,
} from "./current-store";
import type { AuthTokenResponse } from "./session";

vi.mock("./access-control", () => ({ getCurrentPlatformAccess: vi.fn() }));
vi.mock("./current-store", async (original) => ({
  ...(await original<typeof import("./current-store")>()),
  getCurrentMerchantStoreAccess: vi.fn(),
}));

const login: AuthTokenResponse = {
  accessToken: "new-account-token",
  accessTokenExpiresAt: "2026-10-19T12:00:00Z",
  user: {
    id: "user",
    email: "admin@selfx.test",
    displayName: "Admin",
    status: "ACTIVE",
    hasPlatformAccess: true,
  },
};
const merchant: CurrentStoreAccess = {
  store: { id: "store-a", name: "Store A", status: "ACTIVE" },
  permissions: {
    storeId: "store-a",
    membershipId: "membership",
    platformBypass: false,
    permissions: ["stores.view", "roles.view"],
    featureKeys: [],
    paymentAccess: { view: true, manage: true },
  },
  hasMultipleStores: false,
  impersonation: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: true,
    permissions: [],
  });
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
    store: null,
    permissions: null,
    hasMultipleStores: false,
    impersonation: null,
  });
});

describe("safeLoginNextPath", () => {
  it("preserves a local Shopify approval path and query", () => {
    expect(
      safeLoginNextPath(
        "/app/integrations/shopify/link?token=abcdefghijklmnopqrstuvwxyzABCDEFG1234567890_",
      ),
    ).toContain("/app/integrations/shopify/link?token=");
  });

  it("rejects protocol-relative and absolute redirects", () => {
    expect(safeLoginNextPath("//example.com/steal")).toBe("/app/dashboard");
    expect(safeLoginNextPath("https://example.com/steal")).toBe(
      "/app/dashboard",
    );
  });
  it("rejects backslash-based cross-origin redirects", () => {
    expect(safeLoginNextPath("/\\example.com/steal")).toBe("/app/dashboard");
  });
});

describe("resolveLoginNextPath", () => {
  it.each([
    "/app/payments",
    "/app/products/garments?sort=name#top",
    "/app/kiosks/device/edit",
  ])(
    "lands Superadmin on dashboard instead of saved merchant destination %s",
    async (next) => {
      expect(await resolveLoginNextPath(next, login)).toBe("/app/dashboard");
      expect(getCurrentPlatformAccess).toHaveBeenCalledWith(
        "new-account-token",
      );
      expect(getCurrentMerchantStoreAccess).toHaveBeenCalledWith(
        "new-account-token",
      );
    },
  );

  it("keeps a permitted platform destination and its query/hash", async () => {
    expect(
      await resolveLoginNextPath("/app/roles?view=staff#permissions", login),
    ).toBe("/app/roles?view=staff#permissions");
  });

  it("checks the new user's actual permissions for restricted platform pages", async () => {
    vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
      isSuperadmin: false,
      permissions: ["STORES_VIEW"],
    });
    expect(await resolveLoginNextPath("/app/roles", login)).toBe(
      "/app/dashboard",
    );
    expect(await resolveLoginNextPath("/app/stores/store-a", login)).toBe(
      "/app/stores/store-a",
    );
  });

  it("preserves permitted merchant return destinations", async () => {
    vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
      isSuperadmin: false,
      permissions: [],
    });
    vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue(merchant);
    const storeLogin = {
      ...login,
      user: { ...login.user, hasPlatformAccess: false },
    };
    expect(
      await resolveLoginNextPath("/app/payments?gateway=PHONEPE", storeLogin),
    ).toBe("/app/payments?gateway=PHONEPE");
    expect(
      await resolveLoginNextPath("/app/products/garments", storeLogin),
    ).toBe("/app/products/garments");
    expect(await resolveLoginNextPath("/app/roles", storeLogin)).toBe(
      "/app/roles",
    );
    expect(
      await resolveLoginNextPath("/app/platform/pricing", storeLogin),
    ).toBe("/app/dashboard");
  });

  it("rejects merchant pages without the required permission/entitlement", async () => {
    vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
      isSuperadmin: false,
      permissions: [],
    });
    vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
      ...merchant,
      permissions: {
        ...merchant.permissions!,
        paymentAccess: { view: false, manage: false },
      },
    });
    const storeLogin = {
      ...login,
      user: { ...login.user, hasPlatformAccess: false },
    };
    expect(await resolveLoginNextPath("/app/payments", storeLogin)).toBe(
      "/app/dashboard",
    );
    expect(await resolveLoginNextPath("/app/kiosks", storeLogin)).toBe(
      "/app/dashboard",
    );
  });

  it("keeps the Shopify approval continuation intact for onboarding", async () => {
    const next = "/app/integrations/shopify/link?token=approval-token";
    expect(await resolveLoginNextPath(next, login)).toBe(next);
    expect(getCurrentPlatformAccess).not.toHaveBeenCalled();
  });

  it("falls back to the dashboard when access cannot be verified", async () => {
    vi.mocked(getCurrentPlatformAccess).mockRejectedValue(
      new Error("Unavailable"),
    );
    expect(await resolveLoginNextPath("/app/roles", login)).toBe(
      "/app/dashboard",
    );
  });

  it.each([null, "//other.example", "/login", "/app/unknown"])(
    "defaults unsafe or unknown destinations to dashboard: %s",
    async (next) => {
      expect(await resolveLoginNextPath(next, login)).toBe("/app/dashboard");
    },
  );
});
