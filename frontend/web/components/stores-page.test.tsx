import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import StoreDashboardPage from "../app/app/stores/[storeId]/page";
import StoresPage from "../app/app/stores/page";
import {
  createStore,
  deleteStore,
  getEffectiveStorePermissions,
  getStore,
  getStoreKioskConfiguration,
  listStorePermissions,
  listStoreRoles,
  listStoreUsers,
  listStores,
  pairStoreKiosk,
  updateStoreKioskConfiguration,
} from "@/lib/stores";
import { useSession } from "@/lib/session";

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
}));

vi.mock("@/lib/session", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/stores", () => ({
  activateStore: vi.fn(),
  createStore: vi.fn(),
  createStoreKioskConfigurationAssetUploadIntent: vi.fn(),
  deactivateStore: vi.fn(),
  deleteStore: vi.fn(),
  getEffectiveStorePermissions: vi.fn(),
  getStore: vi.fn(),
  getStoreKioskConfiguration: vi.fn(),
  listStorePermissions: vi.fn(),
  listStoreRoles: vi.fn(),
  listStoreUsers: vi.fn(),
  listStores: vi.fn(),
  pairStoreKiosk: vi.fn(),
  updateStore: vi.fn(),
  updateStoreKioskConfiguration: vi.fn(),
}));

const store = {
  id: "store-1",
  name: "SelfX Demo Store",
  slug: "selfx-demo-store",
  status: "ACTIVE",
  contactEmail: "ops@example.com",
  contactPhone: null,
  website: null,
  address: null,
  city: "Bengaluru",
  stateRegion: "KA",
  postalCode: null,
  country: "India",
  timezone: "Asia/Kolkata",
  totalKiosks: 1,
  activeKiosks: 1,
  offlineKiosks: 0,
  lastActivityAt: "2026-08-16T00:00:00.000Z",
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-16T00:00:00.000Z",
  internalLegacyModel: "ORGANIZATION_AS_STORE",
} as const;

const kiosk = {
  id: "kiosk-1",
  displayName: "Front Display",
  status: "ACTIVE",
  assignment: {
    scope: "ORGANIZATION",
    organizationId: "store-1",
    organizationName: "SelfX Demo Store",
    storeId: null,
    storeName: null,
  },
  platform: "android",
  appVersion: "1.0.0",
  installationId: "install-1",
  pairedAt: "2026-08-16T00:00:00.000Z",
  lastSeenAt: "2026-08-16T00:01:00.000Z",
  inactiveAt: null,
  revokedAt: null,
  deletedAt: null,
  createdAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-16T00:00:00.000Z",
  latestConfigurationVersion: 3,
} as const;

const configuration = {
  version: 3,
  display: {
    idleMode: "STATIC",
    slideDurationSeconds: 6,
    title: "SelfX Virtual Try-On",
    subtitle: "Find your perfect fit in seconds.",
    ctaLabel: "Start Try-On",
    assets: [
      {
        id: "asset-1",
        type: "BUNDLED_IMAGE",
        label: "SelfX default video",
        url: null,
        bundledAssetKey: "selfx-default-kiosk-video",
        assetRef: null,
        contentType: null,
        sizeBytes: null,
        sortOrder: 0,
      },
    ],
  },
  capture: {
    countdownSeconds: 10,
    soundEnabled: true,
    soundProfile: "SELFX_SIGNATURE",
    guidanceAudioEnabled: false,
  },
  experience: {
    enabledGarmentIntents: ["TOP", "BOTTOM", "FULL_OUTFIT"],
    sessionIdleTimeoutSeconds: 120,
  },
  assetUpload: {
    supported: true,
    maxImageBytes: 12 * 1024 * 1024,
    maxVideoBytes: 80 * 1024 * 1024,
    supportedContentTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
    ],
  },
  captureUpload: {
    maxImageBytes: 10 * 1024 * 1024,
    supportedContentTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  updatedAt: "2026-08-16T00:00:00.000Z",
} as const;

const permissions = [
  {
    id: "permission-kiosks-configure",
    code: "kiosks.configure",
    module: "kiosks",
    action: "configure",
    label: "Configure Kiosks",
    description: "Update Store-owned kiosk runtime configuration.",
    isSystem: true,
  },
  {
    id: "permission-users-update",
    code: "users.update",
    module: "users",
    action: "update",
    label: "Update Store Users",
    description: "Update Store memberships.",
    isSystem: true,
  },
] as const;

const role = {
  id: "role-1",
  name: "Manager",
  description: null,
  systemCode: "manager",
  isSystem: true,
  isActive: true,
  permissionsCount: 2,
  assignedUsersCount: 1,
  permissions,
  createdAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-16T00:00:00.000Z",
} as const;

const storeUser = {
  membershipId: "membership-1",
  userId: "user-1",
  email: "manager@example.com",
  displayName: "Manager",
  status: "ACTIVE",
  roles: [role],
  joinedAt: "2026-08-16T00:00:00.000Z",
  createdAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-16T00:00:00.000Z",
} as const;

describe("STORE-1 web Store management", () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      status: "authenticated",
      accessToken: "staff-token",
      user: { email: "admin@selfx.test", displayName: "Admin" },
    } as never);
    vi.mocked(listStores).mockResolvedValue({
      data: [store],
      pagination: {
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
        hasMore: false,
      },
    } as never);
    vi.mocked(createStore).mockResolvedValue(store as never);
    vi.mocked(deleteStore).mockResolvedValue({
      ...store,
      status: "INACTIVE",
    } as never);
    vi.mocked(getStore).mockResolvedValue({
      ...store,
      kiosks: { data: [kiosk] },
    } as never);
    vi.mocked(listStoreRoles).mockResolvedValue({
      data: [role],
      pagination: {
        page: 1,
        pageSize: 100,
        total: 1,
        totalPages: 1,
        hasMore: false,
      },
    } as never);
    vi.mocked(listStoreUsers).mockResolvedValue({
      data: [storeUser],
      pagination: {
        page: 1,
        pageSize: 100,
        total: 1,
        totalPages: 1,
        hasMore: false,
      },
    } as never);
    vi.mocked(listStorePermissions).mockResolvedValue({
      data: permissions,
    } as never);
    vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
      storeId: "store-1",
      permissions: [
        "stores.update",
        "users.invite",
        "users.deactivate",
        "roles.assign",
        "roles.create",
        "roles.update",
        "roles.delete",
        "kiosks.pair",
        "kiosks.configure",
      ],
      platformBypass: true,
      membershipId: null,
    });
    vi.mocked(pairStoreKiosk).mockResolvedValue(kiosk as never);
    vi.mocked(getStoreKioskConfiguration).mockResolvedValue(
      configuration as never,
    );
    vi.mocked(updateStoreKioskConfiguration).mockResolvedValue({
      ...configuration,
      version: 4,
    } as never);
  });

  it("renders the Store directory with product Store terminology", async () => {
    render(<StoresPage />);

    expect(await screen.findByText("SelfX Demo Store")).toBeTruthy();
    expect(screen.getByText("Store directory")).toBeTruthy();
    expect(screen.queryByText(/Organization/i)).toBeNull();
  });

  it("creates a Store from the directory dialog", async () => {
    render(<StoresPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Add Store/i }));
    fireEvent.change(screen.getByText("Store Name *").nextElementSibling!, {
      target: { value: "New Retail Store" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Store" }));

    await waitFor(() => expect(createStore).toHaveBeenCalled());
    expect(createStore).toHaveBeenCalledWith(
      "staff-token",
      expect.objectContaining({ name: "New Retail Store" }),
    );
  });

  it("allows inactive Stores to be deleted from the directory", async () => {
    vi.mocked(listStores).mockResolvedValue({
      data: [
        {
          ...store,
          status: "INACTIVE",
          activeKiosks: 0,
        },
      ],
      pagination: {
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
        hasMore: false,
      },
    } as never);

    render(<StoresPage />);

    expect(await screen.findByText("SelfX Demo Store")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]!);

    await waitFor(() =>
      expect(deleteStore).toHaveBeenCalledWith("staff-token", "store-1"),
    );
    await waitFor(() =>
      expect(screen.queryByText("SelfX Demo Store")).toBeNull(),
    );
  });

  it("uses nested Store kiosk configuration APIs from the Store dashboard", async () => {
    render(<StoreDashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Manage/i }));

    await waitFor(() =>
      expect(getStoreKioskConfiguration).toHaveBeenCalledWith(
        "staff-token",
        "store-1",
        "kiosk-1",
      ),
    );
    fireEvent.change(await screen.findByDisplayValue("Start Try-On"), {
      target: { value: "Begin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Configuration" }));

    await waitFor(() =>
      expect(updateStoreKioskConfiguration).toHaveBeenCalledWith(
        "staff-token",
        "store-1",
        "kiosk-1",
        expect.objectContaining({
          display: expect.objectContaining({ ctaLabel: "Begin" }),
        }),
      ),
    );
  });

  it("hides kiosk configuration when kiosks.configure is missing", async () => {
    vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
      storeId: "store-1",
      permissions: ["kiosks.pair"],
      platformBypass: false,
      membershipId: "membership-1",
    });

    render(<StoreDashboardPage />);

    expect(await screen.findByText("Front Display")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Manage/i })).toBeNull();
  });

  it("hides Store user mutation controls when user permissions are missing", async () => {
    vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
      storeId: "store-1",
      permissions: ["kiosks.configure"],
      platformBypass: false,
      membershipId: "membership-1",
    });

    render(<StoreDashboardPage />);

    expect(await screen.findByText("Store Users")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add User/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Roles/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Suspend/i })).toBeNull();
  });

  it("groups role editor permissions by module", async () => {
    render(<StoreDashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Add Role/i }));

    expect(await screen.findByText("kiosks")).toBeTruthy();
    expect(screen.getByText("users")).toBeTruthy();
    expect(screen.getByText("Configure Kiosks")).toBeTruthy();
    expect(screen.getByText("Update Store Users")).toBeTruthy();
  });
});
