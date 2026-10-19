import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { RolesWorkspace } from "./roles-workspace";
import {
  getRolesContext,
  replaceGlobalStoreRolePermissions,
  type RolesContext,
} from "@/lib/roles";
import { replacePlatformRolePermissions } from "@/lib/access-control";

vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "token" }),
}));
vi.mock("@/lib/roles", () => ({
  getRolesContext: vi.fn(),
  replaceGlobalStoreRolePermissions: vi.fn(),
}));
vi.mock("@/lib/access-control", () => ({
  replacePlatformRolePermissions: vi.fn(),
}));
const timestamp = "2026-10-19T00:00:00.000Z";
const permission = (code: string, label: string) => ({
  id: code,
  code,
  label,
  module: "Operations",
  description: label,
  action: "manage",
  applicability: "STORE" as const,
  isSystem: true,
  granted: true,
});
const platformPermissions = [
  permission("STORES_VIEW", "View Stores"),
  permission("PERMISSIONS_MANAGE", "Protected administration"),
].map((p) => ({ ...p, applicability: "PLATFORM_ONLY" as const }));
const storePermissions = [
  permission("roles.assign", "Manage Staff access"),
  permission("products.manage", "Manage products"),
  permission("kiosks.update", "Update kiosks"),
];
const role = (
  id: string,
  name: string,
  systemCode: string,
  permissions: { code: string }[],
) => ({
  id,
  name,
  systemCode,
  description: name + " access",
  assignedUsersCount: 3,
  permissions,
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
      {
        ...role(
          "platform-admin",
          "Platform Admin",
          "platform-staff-admin",
          platformPermissions,
        ),
        permissions: platformPermissions,
        isSystem: true,
        isActive: true,
        permissionsCount: 2,
        createdAt: timestamp,
      },
      {
        ...role(
          "platform-staff",
          "Platform Staff",
          "platform-support-admin",
          platformPermissions.slice(0, 1),
        ),
        permissions: platformPermissions.slice(0, 1),
        isSystem: true,
        isActive: true,
        permissionsCount: 1,
        createdAt: timestamp,
      },
    ],
    storeRoles: {
      canEdit: true,
      permissions: storePermissions,
      staffAssignableCodes: ["products.manage", "kiosks.update"],
      requiredAdminCodes: ["roles.assign"],
      roles: [
        role("global-admin", "Store Admin", "store-admin", storePermissions),
        role(
          "global-staff",
          "Store Staff",
          "staff",
          storePermissions.slice(1, 2),
        ),
      ],
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.mocked(getRolesContext).mockResolvedValue(context());
  vi.mocked(replaceGlobalStoreRolePermissions).mockResolvedValue(
    context().storeRoles,
  );
  vi.mocked(replacePlatformRolePermissions).mockResolvedValue(
    context().roles[0]!,
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows all five shared roles without a Store selector or permission ceiling", async () => {
  render(<RolesWorkspace />);
  for (const name of [
    "Platform Superadmin",
    "Platform Admin",
    "Platform Staff",
    "Store Admin",
    "Store Staff",
  ])
    expect(
      await screen.findByRole("button", { name: new RegExp("^" + name) }),
    ).toBeTruthy();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByLabelText("Search Stores")).toBeNull();
  expect(screen.queryByRole("tablist")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Manage Store permission limit" }),
  ).toBeNull();
  expect(getRolesContext).toHaveBeenCalledWith("token");
  expect(
    screen
      .getByRole("checkbox", { name: "View Stores" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  expect(screen.queryByRole("button", { name: "Save permissions" })).toBeNull();
});

it("switches the selected border and checkboxes between role types", async () => {
  render(<RolesWorkspace />);
  const staff = await screen.findByRole("button", { name: /^Store Staff/ });
  fireEvent.click(staff);
  expect(staff.getAttribute("aria-pressed")).toBe("true");
  expect(staff.className).toContain("border-primary!");
  expect(
    screen.getByRole("heading", { name: "Store Staff permissions" }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("checkbox", { name: "Manage products" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(screen.queryByRole("checkbox", { name: "View Stores" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Platform Staff/ }));
  expect(staff.getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByRole("checkbox", { name: "View Stores" })).toBeTruthy();
});

it("saves Store Staff globally by system code and refreshes authorization", async () => {
  const changed = vi.fn();
  window.addEventListener("selfx:permissions-changed", changed);
  render(<RolesWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: /^Store Staff/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Update kiosks" }));
  fireEvent.click(screen.getByRole("button", { name: "Save permissions" }));
  await waitFor(() =>
    expect(replaceGlobalStoreRolePermissions).toHaveBeenCalledWith(
      "token",
      "staff",
      ["products.manage", "kiosks.update"],
      timestamp,
    ),
  );
  expect(await screen.findByRole("status")).toHaveProperty(
    "textContent",
    "Store Staff permissions saved across all Stores.",
  );
  expect(changed).toHaveBeenCalledOnce();
  expect(replacePlatformRolePermissions).not.toHaveBeenCalled();
  window.removeEventListener("selfx:permissions-changed", changed);
});

it("keeps required Store Admin permissions while clearing editable permissions", async () => {
  render(<RolesWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: /^Store Admin/ }));
  expect(
    screen
      .getByRole("checkbox", { name: "Manage Staff access" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  fireEvent.click(screen.getByRole("button", { name: "Save permissions" }));
  await waitFor(() =>
    expect(replaceGlobalStoreRolePermissions).toHaveBeenCalledWith(
      "token",
      "store-admin",
      ["roles.assign"],
      timestamp,
    ),
  );
});

it("limits Staff bulk selection and supports permission search", async () => {
  render(<RolesWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: /^Store Staff/ }));
  fireEvent.click(screen.getByRole("button", { name: "Select all" }));
  expect(
    screen
      .getByRole("checkbox", { name: "Manage Staff access" })
      .getAttribute("aria-checked"),
  ).toBe("false");
  expect(
    screen
      .getByRole("checkbox", { name: "Update kiosks" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  fireEvent.change(screen.getByLabelText("Search permissions"), {
    target: { value: "products" },
  });
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  expect(
    screen.getByRole("checkbox", { name: "Manage products" }),
  ).toBeTruthy();
});

it("shows shared Store roles read-only to merchant viewers without cross-Store user counts", async () => {
  const value = context();
  value.canViewPlatform = false;
  value.roles = [];
  value.permissions = [];
  value.storeRoles.canEdit = false;
  value.storeRoles.roles.forEach((r) => {
    r.assignedUsersCount = null;
  });
  vi.mocked(getRolesContext).mockResolvedValue(value);
  render(<RolesWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: /^Store Staff/ }));
  expect(screen.queryByRole("button", { name: /^Platform Admin/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Save permissions" })).toBeNull();
  expect(
    screen
      .getByRole("checkbox", { name: "Manage products" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  expect(screen.queryByText(/\d+ assigned users/)).toBeNull();
});

it("preserves failed global drafts and displays stale-save guidance", async () => {
  vi.mocked(replaceGlobalStoreRolePermissions).mockRejectedValue(
    new Error("This role changed. Reload before saving."),
  );
  render(<RolesWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: /^Store Staff/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Manage products" }));
  fireEvent.click(screen.getByRole("button", { name: "Save permissions" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(
    screen
      .getByRole("checkbox", { name: "Manage products" })
      .getAttribute("aria-checked"),
  ).toBe("false");
  expect(screen.queryByRole("status")).toBeNull();
});

it("continues saving Platform roles through the Platform API", async () => {
  render(<RolesWorkspace />);
  fireEvent.click(
    await screen.findByRole("button", { name: /^Platform Admin/ }),
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
  expect(replaceGlobalStoreRolePermissions).not.toHaveBeenCalled();
});

it("respects delegated Platform editing limits", async () => {
  vi.mocked(getRolesContext).mockResolvedValue({
    ...context(),
    canEditPlatformAdmin: false,
    assignablePlatformCodes: ["STORES_VIEW"],
  });
  render(<RolesWorkspace />);
  fireEvent.click(
    await screen.findByRole("button", { name: /^Platform Admin/ }),
  );
  expect(screen.queryByRole("button", { name: "Save permissions" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Platform Staff/ }));
  expect(
    screen
      .getByRole("checkbox", { name: "Protected administration" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
});

it("displays context failures without showing stale role editors", async () => {
  vi.mocked(getRolesContext).mockRejectedValue(
    new Error("Role access unavailable"),
  );
  render(<RolesWorkspace />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("checkbox")).toBeNull();
});
