import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthenticatedShell } from "@/components/authenticated-shell";

const mocks = vi.hoisted(() => ({
  pathname: "/app/analytics",
  getStoreAccess: vi.fn(),
  getPlatformAccess: vi.fn(),
  pageMounted: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => mocks.router,
}));
vi.mock("@/lib/session", () => ({
  useSession: () => ({
    status: "authenticated",
    accessToken: "test-token",
    user: { hasPlatformAccess: false },
    refresh: vi.fn(),
    logout: vi.fn(),
  }),
}));
vi.mock("@/lib/current-store", () => ({
  getCurrentMerchantStoreAccess: mocks.getStoreAccess,
}));
vi.mock("@/lib/access-control", () => ({
  getCurrentPlatformAccess: mocks.getPlatformAccess,
}));
vi.mock("@selfx/ui", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  Button: ({ children }: { children: ReactNode }) => (
    <button>{children}</button>
  ),
  LoadingState: ({ label }: { label: string }) => <p>{label}</p>,
  ErrorState: ({ title }: { title: string }) => <p>{title}</p>,
}));

const storeContext = {
  store: { id: "store-1", name: "Test Store", status: "ACTIVE" },
  permissions: {
    permissions: ["analytics.view", "stores.view", "users.view"],
    featureKeys: ["ANALYTICS"],
    platformBypass: false,
    storeLocationLimit: 3,
  },
  impersonation: null,
};

function MerchantPage() {
  mocks.pageMounted();
  return <p>Merchant page</p>;
}

describe("merchant-only shell routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/app/analytics";
    mocks.getStoreAccess.mockResolvedValue(storeContext);
    mocks.getPlatformAccess.mockResolvedValue({
      isSuperadmin: false,
      permissions: [],
    });
  });

  afterEach(cleanup);

  it.each(["/app/analytics", "/app/locations", "/app/staff"])(
    "does not mount %s in platform mode",
    async (pathname) => {
      mocks.pathname = pathname;
      mocks.getPlatformAccess.mockResolvedValue({
        isSuperadmin: true,
        permissions: [],
      });
      render(
        <AuthenticatedShell>
          <MerchantPage />
        </AuthenticatedShell>,
      );
      expect(await screen.findByText("Store access required")).toBeTruthy();
      expect(mocks.pageMounted).not.toHaveBeenCalled();
    },
  );

  it("waits for Store access before mounting a merchant page", () => {
    mocks.getStoreAccess.mockReturnValue(new Promise(() => {}));
    render(
      <AuthenticatedShell>
        <MerchantPage />
      </AuthenticatedShell>,
    );
    expect(screen.getByText("Checking Store access")).toBeTruthy();
    expect(mocks.pageMounted).not.toHaveBeenCalled();
  });

  it("allows an authorized Store user", async () => {
    render(
      <AuthenticatedShell>
        <MerchantPage />
      </AuthenticatedShell>,
    );
    expect(await screen.findByText("Merchant page")).toBeTruthy();
  });

  it("uses the target Store permissions during controlled impersonation", async () => {
    mocks.getPlatformAccess.mockResolvedValue({
      isSuperadmin: true,
      permissions: [],
    });
    mocks.getStoreAccess.mockResolvedValue({
      ...storeContext,
      impersonation: {
        id: "impersonation-1",
        targetStoreName: "Test Store",
        expiresAt: "2026-09-17T18:00:00Z",
      },
    });
    render(
      <AuthenticatedShell>
        <MerchantPage />
      </AuthenticatedShell>,
    );
    expect(await screen.findByText("Merchant page")).toBeTruthy();
    expect(screen.getByText("Impersonating Store:")).toBeTruthy();
  });

  it("does not bypass the target Store plan during impersonation", async () => {
    mocks.getPlatformAccess.mockResolvedValue({
      isSuperadmin: true,
      permissions: [],
    });
    mocks.getStoreAccess.mockResolvedValue({
      ...storeContext,
      permissions: {
        ...storeContext.permissions,
        featureKeys: [],
        platformBypass: true,
      },
      impersonation: {
        id: "impersonation-1",
        targetStoreName: "Test Store",
        expiresAt: "2026-09-17T18:00:00Z",
      },
    });
    render(
      <AuthenticatedShell>
        <MerchantPage />
      </AuthenticatedShell>,
    );
    expect(await screen.findByText("Store access required")).toBeTruthy();
    expect(mocks.pageMounted).not.toHaveBeenCalled();
  });
});
