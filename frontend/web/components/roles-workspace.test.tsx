import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { RolesWorkspace } from "./roles-workspace";
import {
  getRolesContext,
  getStoreRolesWorkspace,
  type RolesContext,
  type StoreRolesWorkspace,
} from "@/lib/roles";
import {
  replacePlatformRolePermissions,
  replaceStorePermissionGrants,
} from "@/lib/access-control";
import { replaceStoreRolePermissions } from "@/lib/stores";

vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "token" }),
}));
vi.mock("@/lib/roles", () => ({
  getRolesContext: vi.fn(),
  getStoreRolesWorkspace: vi.fn(),
}));
vi.mock("@/lib/access-control", () => ({
  replacePlatformRolePermissions: vi.fn(),
  replaceStorePermissionGrants: vi.fn(),
}));
vi.mock("@/lib/stores", () => ({ replaceStoreRolePermissions: vi.fn() }));
vi.mock("@selfx/ui", async (original) => ({
  ...(await original<typeof import("@selfx/ui")>()),
  SelectMenu: ({
    ariaLabel,
    value,
    onChange,
    options,
    disabled,
  }: {
    ariaLabel: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: ReactNode }[];
    disabled?: boolean;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

const timestamp = "2026-10-18T00:00:00.000Z";
function permission(
  code: string,
  label: string,
  applicability: "STORE" | "PLATFORM_ONLY" = "STORE",
  granted = true,
) {
  return {
    id: code,
    code,
    label,
    module: "operations",
    action: "manage",
    description: label,
    applicability,
    isSystem: true,
    granted,
  };
}
const platformPermissions = [
  permission("STORES_VIEW", "View Stores", "PLATFORM_ONLY"),
  permission("PERMISSIONS_MANAGE", "Protected administration", "PLATFORM_ONLY"),
];
const storePermissions = [
  permission("roles.assign", "Manage Staff access"),
  permission("products.manage", "Manage products"),
  permission("kiosks.update", "Update kiosks", "STORE", false),
];
const role = (
  id: string,
  name: string,
  systemCode: string,
  permissions = storePermissions.slice(0, 2),
) => ({
  id,
  name,
  systemCode,
  description: `${name} access`,
  isSystem: true,
  isActive: true,
  assignedUsersCount: 2,
  permissionsCount: permissions.length,
  permissions,
  createdAt: timestamp,
  updatedAt: timestamp,
});
function context(): RolesContext {
  return {
    canViewPlatform: true,
    canEditPlatformAdmin: true,
    canEditPlatformStaff: true,
    assignablePlatformCodes: platformPermissions.map((p) => p.code),
    permissions: platformPermissions,
    roles: [
      role(
        "platform-admin",
        "Platform Admin",
        "platform-staff-admin",
        platformPermissions,
      ),
      role(
        "platform-staff",
        "Platform Staff",
        "platform-support-admin",
        platformPermissions.slice(0, 1),
      ),
    ],
    stores: {
      data: [
        { id: "store-a", name: "Avinash stores" },
        { id: "store-b", name: "Other Store" },
      ],
      page: 1,
      total: 2,
      hasMore: false,
    },
  };
}
function storeWorkspace(): StoreRolesWorkspace {
  return {
    canEditCeiling: false,
    ceilingUpdatedAt: timestamp,
    permissions: storePermissions,
    roles: [
      role("store-admin", "Store Admin", "store-admin"),
      role("store-staff", "Staff", "staff", storePermissions.slice(1, 2)),
    ],
    policy: {
      canView: true,
      canEditAdmin: false,
      canEditStaff: true,
      assignableCodes: ["roles.assign", "products.manage"],
      staffAssignableCodes: ["products.manage"],
      requiredAdminCodes: ["roles.assign"],
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.mocked(getRolesContext).mockResolvedValue(context());
  vi.mocked(getStoreRolesWorkspace).mockResolvedValue(storeWorkspace());
  vi.mocked(replaceStoreRolePermissions).mockResolvedValue(
    storeWorkspace().roles[1]!,
  );
  vi.mocked(replacePlatformRolePermissions).mockResolvedValue(
    context().roles[0]!,
  );
  vi.mocked(replaceStorePermissionGrants).mockResolvedValue({ data: [] });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows all platform role types with protected Superadmin authority read-only", async () => {
  render(<RolesWorkspace />);
  expect(
    await screen.findByRole("button", { name: /Platform Superadmin/ }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: /Platform Admin/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Platform Staff/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Save permissions" })).toBeNull();
  expect(
    screen
      .getByRole("checkbox", { name: "View Stores" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
});
it("saves platform permissions with their version and refreshes navigation access", async () => {
  const changed = vi.fn();
  window.addEventListener("selfx:permissions-changed", changed);
  render(<RolesWorkspace />);
  fireEvent.click(
    await screen.findByRole("button", { name: /Platform Admin/ }),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "View Stores" }));
  fireEvent.click(screen.getByRole("button", { name: "Save permissions" }));
  await waitFor(() =>
    expect(replacePlatformRolePermissions).toHaveBeenCalledWith(
      "token",
      "platform-admin",
      ["PERMISSIONS_MANAGE"],
      timestamp,
    ),
  );
  expect(await screen.findByRole("status")).toBeTruthy();
  expect(changed).toHaveBeenCalledOnce();
  window.removeEventListener("selfx:permissions-changed", changed);
});
it("allows a delegated platform manager to edit Staff while Admin stays read-only", async () => {
  vi.mocked(getRolesContext).mockResolvedValue({
    ...context(),
    canEditPlatformAdmin: false,
    assignablePlatformCodes: ["STORES_VIEW"],
  });
  render(<RolesWorkspace />);
  fireEvent.click(
    await screen.findByRole("button", { name: /Platform Admin/ }),
  );
  expect(screen.queryByRole("button", { name: "Save permissions" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Platform Staff/ }));
  expect(
    screen
      .getByRole("checkbox", {
        name: "Protected administration",
      })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("checkbox", { name: "View Stores" }));
  fireEvent.click(screen.getByRole("button", { name: "Save permissions" }));
  await waitFor(() =>
    expect(replacePlatformRolePermissions).toHaveBeenCalledWith(
      "token",
      "platform-staff",
      [],
      timestamp,
    ),
  );
});
it("opens Store roles for a merchant and scopes Staff changes to the selected Store", async () => {
  vi.mocked(getRolesContext).mockResolvedValue({
    ...context(),
    canViewPlatform: false,
    roles: [],
    permissions: [],
  });
  render(<RolesWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: /^Store Staff/ }));
  expect(screen.queryByRole("tab", { name: "Platform roles" })).toBeNull();
  expect(
    screen
      .getByRole("checkbox", {
        name: "Manage Staff access",
      })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  expect(
    screen
      .getByRole("checkbox", {
        name: "Update kiosks",
      })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  fireEvent.change(screen.getByLabelText("Store for roles"), {
    target: { value: "store-b" },
  });
  await waitFor(() =>
    expect(getStoreRolesWorkspace).toHaveBeenLastCalledWith("token", "store-b"),
  );
  fireEvent.click(await screen.findByRole("button", { name: /^Store Staff/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Manage products" }));
  fireEvent.click(screen.getByRole("button", { name: "Save permissions" }));
  await waitFor(() =>
    expect(replaceStoreRolePermissions).toHaveBeenCalledWith(
      "token",
      "store-b",
      "store-staff",
      [],
      timestamp,
    ),
  );
  expect(replacePlatformRolePermissions).not.toHaveBeenCalled();
});
it("retains required Store Admin controls and offers the ceiling only to Superadmin", async () => {
  vi.mocked(getStoreRolesWorkspace).mockResolvedValue({
    ...storeWorkspace(),
    canEditCeiling: true,
    policy: { ...storeWorkspace().policy, canEditAdmin: true },
  });
  render(<RolesWorkspace />);
  await screen.findByRole("button", { name: /Platform Superadmin/ });
  fireEvent.click(screen.getByRole("tab", { name: "Store roles" }));
  await screen.findByRole("button", { name: /^Store Admin/ });
  expect(
    screen
      .getByRole("checkbox", {
        name: "Manage Staff access",
      })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  fireEvent.click(
    screen.getByRole("button", { name: "Manage Store permission limit" }),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Update kiosks" }));
  fireEvent.click(screen.getByRole("button", { name: "Save permissions" }));
  await waitFor(() =>
    expect(replaceStorePermissionGrants).toHaveBeenCalledWith(
      "token",
      "store-a",
      ["roles.assign", "products.manage", "kiosks.update"],
      timestamp,
    ),
  );
});
it("keeps failed saves visible and preserves the draft for review", async () => {
  vi.mocked(replacePlatformRolePermissions).mockRejectedValue(
    new Error("This role changed. Reload before saving."),
  );
  render(<RolesWorkspace />);
  fireEvent.click(
    await screen.findByRole("button", { name: /Platform Admin/ }),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "View Stores" }));
  fireEvent.click(screen.getByRole("button", { name: "Save permissions" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(
    screen.getByText("This role changed. Reload before saving."),
  ).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
  expect(
    screen
      .getByRole("checkbox", { name: "View Stores" })
      .getAttribute("aria-checked"),
  ).toBe("false");
});
it("handles empty Stores and supports searching the paginated Store selector", async () => {
  vi.mocked(getRolesContext).mockResolvedValue({
    ...context(),
    canViewPlatform: false,
    stores: { data: [], page: 1, total: 0, hasMore: false },
  });
  render(<RolesWorkspace />);
  expect(
    await screen.findByText("No active Stores are available for this account."),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Search Stores"), {
    target: { value: "Avinash" },
  });
  await waitFor(() =>
    expect(getRolesContext).toHaveBeenLastCalledWith("token", 1, "Avinash"),
  );
  expect(getStoreRolesWorkspace).not.toHaveBeenCalled();
});
it("keeps the selected Store clearly labelled while browsing another page of Stores", async () => {
  const first = {
    ...context(),
    canViewPlatform: false,
    stores: {
      data: [{ id: "store-a", name: "Avinash stores" }],
      page: 1,
      total: 2,
      hasMore: true,
    },
  };
  vi.mocked(getRolesContext)
    .mockResolvedValueOnce(first)
    .mockResolvedValue({
      ...first,
      stores: {
        data: [{ id: "store-b", name: "Other Store" }],
        page: 2,
        total: 2,
        hasMore: false,
      },
    });
  render(<RolesWorkspace />);
  await screen.findByRole("button", { name: /^Store Staff/ });
  fireEvent.click(screen.getByRole("button", { name: "Next Stores" }));
  await waitFor(() =>
    expect(getRolesContext).toHaveBeenLastCalledWith("token", 2, ""),
  );
  await screen.findByRole("option", { name: "Other Store" });
  expect(
    (screen.getByLabelText("Store for roles") as HTMLSelectElement).value,
  ).toBe("store-a");
  expect(screen.getByRole("option", { name: "Avinash stores" })).toBeTruthy();
  expect(getStoreRolesWorkspace).toHaveBeenLastCalledWith("token", "store-a");
});
