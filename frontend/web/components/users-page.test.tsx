import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { UsersPage } from "./users-page";
import { UserEditor } from "./user-editor";
import {
  getCurrentPlatformAccess,
  listPlatformRoles,
} from "@/lib/access-control";
import {
  assignFirstStoreOwner,
  deleteUser,
  getUser,
  listUsers,
  listUserStores,
  updateUser,
  type ManagedUser,
} from "@/lib/users";
import { listStoreRoles } from "@/lib/stores";
import { SafeApiError } from "@/lib/api";

vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "test-token" }),
}));
vi.mock("@/lib/access-control", () => ({
  getCurrentPlatformAccess: vi.fn(),
  listPlatformRoles: vi.fn(),
}));
vi.mock("@/lib/users", () => ({
  getUser: vi.fn(),
  listUsers: vi.fn(),
  listUserStores: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  assignFirstStoreOwner: vi.fn(),
}));
vi.mock("@/lib/stores", () => ({ listStoreRoles: vi.fn() }));
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
    onChange: (v: string) => void;
    options: { value: string; label: ReactNode; disabled?: boolean }[];
    disabled?: boolean;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));
const user: ManagedUser = {
  id: "user",
  email: "owner@example.com",
  displayName: "Avinash",
  status: "ACTIVE",
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
  version: "a".repeat(64),
  isProtectedSuperadmin: false,
  staticPlatformRoles: [],
  platformRoles: [],
  memberships: [
    {
      membershipId: "archived-member",
      storeId: "old-store",
      storeName: "Old Store",
      storeStatus: "ARCHIVED",
      membershipRole: "ORGANIZATION_OWNER",
      status: "ACTIVE",
      storeScopeMode: "ALL_STORES",
      updatedAt: "2026-10-18T00:00:00.000Z",
      roles: [{ id: "old-role", name: "Store Admin", isActive: true }],
    },
  ],
};
const pagination = {
  page: 1,
  pageSize: 25,
  total: 1,
  totalPages: 1,
  hasMore: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  // jsdom lacks PointerEvent; Base UI dispatches pointer clicks to its input.
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: true,
    permissions: [],
  });
  vi.mocked(listPlatformRoles).mockResolvedValue({ data: [] });
  vi.mocked(listUsers).mockResolvedValue({ data: [user], pagination });
  vi.mocked(getUser).mockResolvedValue(user);
  vi.mocked(listUserStores).mockResolvedValue({
    data: [{ id: "new-store", name: "Avinash stores", status: "ACTIVE" }],
    pagination,
  });
  vi.mocked(listStoreRoles).mockResolvedValue({
    data: [{ id: "admin-role", name: "Store Admin", isActive: true } as never],
    pagination,
  });
  vi.mocked(updateUser).mockResolvedValue(user);
  vi.mocked(assignFirstStoreOwner).mockResolvedValue({
    ...user,
    version: "b".repeat(64),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const editor = () =>
  render(
    <UserEditor
      token="test-token"
      user={user}
      roles={[]}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      onOwnerAssigned={vi.fn()}
    />,
  );

it("shows clear account and archived Store details, and opens one Edit modal", async () => {
  render(<UsersPage />);
  expect(await screen.findByText("Old Store (Archived)")).toBeTruthy();
  expect(screen.getAllByText("Users").length).toBeGreaterThan(0);
  fireEvent.click(
    screen.getByRole("button", { name: "Edit owner@example.com" }),
  );
  const dialog = await screen.findByRole("dialog");
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(
    (within(dialog).getByLabelText("Login email") as HTMLInputElement).value,
  ).toBe("owner@example.com");
  expect(
    (
      within(dialog).getByLabelText(
        "New password (optional)",
      ) as HTMLInputElement
    ).value,
  ).toBe("");
  expect(
    within(dialog).getByText(/Store Admin links are protected/),
  ).toBeTruthy();
});
it("omits the blank optional password and preserves unrelated memberships", async () => {
  editor();
  fireEvent.change(screen.getByLabelText("Full name"), {
    target: { value: "Avinash J" },
  });
  fireEvent.submit(screen.getByRole("form", { name: "Edit user" }));
  await waitFor(() => expect(updateUser).toHaveBeenCalled());
  expect(vi.mocked(updateUser).mock.calls[0]![2]).toEqual({
    version: user.version,
    displayName: "Avinash J",
    email: user.email,
    status: "ACTIVE",
    memberships: [],
  });
});
it("keeps the modal open on duplicate email and clears a submitted password", async () => {
  vi.mocked(updateUser).mockRejectedValue(
    new SafeApiError(
      "USER_EMAIL_CONFLICT",
      "This login email is already used by another account.",
      409,
    ),
  );
  editor();
  fireEvent.change(screen.getByLabelText("Login email"), {
    target: { value: "duplicate@example.com" },
  });
  fireEvent.change(screen.getByLabelText("New password (optional)"), {
    target: { value: "Replacement password 123!" },
  });
  fireEvent.submit(screen.getByRole("form", { name: "Edit user" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(
    (screen.getByLabelText("New password (optional)") as HTMLInputElement)
      .value,
  ).toBe("");
  expect(
    screen.getByLabelText("Login email").getAttribute("aria-invalid"),
  ).toBe("true");
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
});
it("links another Store and its own roles without resubmitting archived memberships", async () => {
  editor();
  await waitFor(() =>
    expect(
      within(screen.getByLabelText("Link to Store")).getByText(
        "Avinash stores",
      ),
    ).toBeTruthy(),
  );
  fireEvent.change(screen.getByLabelText("Link to Store"), {
    target: { value: "new-store" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add Store membership" }));
  fireEvent.click(await screen.findByRole("checkbox", { name: "Store Admin" }));
  fireEvent.submit(screen.getByRole("form", { name: "Edit user" }));
  await waitFor(() => expect(updateUser).toHaveBeenCalled());
  expect(vi.mocked(updateUser).mock.calls[0]![2].memberships).toEqual([
    { storeId: "new-store", status: "ACTIVE", roleIds: ["admin-role"] },
  ]);
});
it("requires explicit Store name confirmation for first-owner assignment", async () => {
  editor();
  await waitFor(() =>
    expect(
      within(screen.getByLabelText("Admin Store")).getByText("Avinash stores"),
    ).toBeTruthy(),
  );
  fireEvent.change(screen.getByLabelText("Admin Store"), {
    target: { value: "new-store" },
  });
  const action = screen.getByRole("button", {
    name: "Assign first Store Admin",
  }) as HTMLButtonElement;
  expect(action.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Type “Avinash stores” to confirm"), {
    target: { value: "Avinash stores" },
  });
  fireEvent.click(action);
  await waitFor(() =>
    expect(assignFirstStoreOwner).toHaveBeenCalledWith("test-token", "user", {
      version: user.version,
      storeId: "new-store",
      confirmStoreName: "Avinash stores",
    }),
  );
  expect(updateUser).not.toHaveBeenCalled();
});
it("uses server-side search and resets the page when filters change", async () => {
  render(<UsersPage />);
  await screen.findByText("Old Store (Archived)");
  fireEvent.change(screen.getByLabelText("Search users"), {
    target: { value: "Avinash" },
  });
  fireEvent.change(screen.getByLabelText("Filter account status"), {
    target: { value: "ACTIVE" },
  });
  await waitFor(() =>
    expect(listUsers).toHaveBeenLastCalledWith(
      "test-token",
      expect.objectContaining({
        search: "Avinash",
        status: "ACTIVE",
        page: 1,
        pageSize: 25,
      }),
    ),
  );
});
it("keeps protected Superadmin accounts uneditable", async () => {
  vi.mocked(listUsers).mockResolvedValue({
    data: [{ ...user, isProtectedSuperadmin: true }],
    pagination,
  });
  render(<UsersPage />);
  expect(await screen.findByText("Protected Superadmin")).toBeTruthy();
  expect(
    (
      (await screen.findByRole("button", {
        name: "Edit owner@example.com",
      })) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

it("requires email confirmation and keeps a failed deletion open", async () => {
  vi.mocked(deleteUser).mockRejectedValue(
    new SafeApiError(
      "STORE_FINAL_ADMIN_PROTECTED",
      "Assign another active Store Admin first.",
      409,
    ),
  );
  render(<UsersPage />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Delete owner@example.com" }),
  );
  const action = screen.getByRole("button", {
    name: "Delete user",
  }) as HTMLButtonElement;
  expect(action.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Type owner@example.com to confirm"), {
    target: { value: user.email },
  });
  fireEvent.click(action);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(deleteUser).toHaveBeenCalledWith("test-token", user, user.email);
});

it("shows deleted names and emails without edit or delete actions", async () => {
  vi.mocked(listUsers).mockResolvedValue({
    data: [
      { ...user, status: "DISABLED", deletedAt: "2026-10-18T01:00:00.000Z" },
    ],
    pagination,
  });
  render(<UsersPage />);
  expect(await screen.findByText("Avinash (Deleted user)")).toBeTruthy();
  expect(screen.getAllByText(user.email).length).toBeGreaterThan(0);
  expect(
    screen.queryByRole("button", { name: "Delete owner@example.com" }),
  ).toBeNull();
  expect(
    (
      screen.getByRole("button", {
        name: "Edit owner@example.com",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
