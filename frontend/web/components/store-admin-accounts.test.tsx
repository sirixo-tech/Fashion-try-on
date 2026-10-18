import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { type ReactNode } from "react";
import { StoreAdminAccounts } from "./store-admin-accounts";
import {
  assignStoreAdmin,
  listUsers,
  updateStoreAdminEmail,
  type ManagedUser,
} from "@/lib/users";
import { SafeApiError } from "@/lib/api";

vi.mock("@/lib/users", () => ({
  assignStoreAdmin: vi.fn(),
  listUsers: vi.fn(),
  updateStoreAdminEmail: vi.fn(),
}));
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
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
const pagination = { page: 1, pageSize: 25, total: 1, totalPages: 1 };
const admin: ManagedUser = {
  id: "admin",
  email: "admin@example.com",
  displayName: "Store Admin",
  status: "ACTIVE",
  version: "a".repeat(64),
  createdAt: "2026-10-18T00:00:00Z",
  updatedAt: "2026-10-18T00:00:00Z",
  isProtectedSuperadmin: false,
  staticPlatformRoles: [],
  platformRoles: [],
  memberships: [
    {
      membershipId: "m",
      storeId: "store",
      storeName: "Avinash stores",
      storeStatus: "ACTIVE",
      isStoreAdmin: true,
      membershipRole: "ORGANIZATION_OWNER",
      status: "ACTIVE",
      storeScopeMode: "ALL_STORES",
      updatedAt: "2026-10-18T00:00:00Z",
      roles: [],
    },
  ],
};
const candidate = {
  ...admin,
  id: "candidate",
  email: "staff@example.com",
  displayName: "Existing Staff",
  memberships: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.mocked(listUsers).mockImplementation(async (_token, query) => ({
    data: query.role === "store-admin" ? [admin] : [candidate],
    pagination,
  }));
  vi.mocked(updateStoreAdminEmail).mockResolvedValue({
    ...admin,
    email: "changed@example.com",
    version: "b".repeat(64),
  });
  vi.mocked(assignStoreAdmin).mockResolvedValue({
    ...candidate,
    memberships: admin.memberships,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const mount = (disabled = false) =>
  render(
    <StoreAdminAccounts
      token="token"
      storeId="store"
      storeName="Avinash stores"
      disabled={disabled}
      onBusyChange={vi.fn()}
    />,
  );

it("loads linked admins and saves the selected login email without profile or contact inputs", async () => {
  mount();
  const input = await screen.findByLabelText("Admin login email");
  expect((input as HTMLInputElement).value).toBe(admin.email);
  expect(listUsers).toHaveBeenCalledWith(
    "token",
    expect.objectContaining({
      storeId: "store",
      role: "store-admin",
      deleted: "active",
    }),
  );
  fireEvent.change(input, { target: { value: "changed@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Save login email" }));
  await waitFor(() =>
    expect(updateStoreAdminEmail).toHaveBeenCalledWith(
      "token",
      admin,
      "store",
      "changed@example.com",
    ),
  );
  expect(await screen.findByRole("status")).toBeTruthy();
  expect(
    (screen.getByLabelText("Admin login email") as HTMLInputElement).value,
  ).toBe("changed@example.com");
});
it("requires acknowledgement for an account shared with another Store", async () => {
  const shared = {
    ...admin,
    memberships: [
      ...admin.memberships,
      {
        ...admin.memberships[0]!,
        membershipId: "second",
        storeId: "second",
        storeName: "Other Store",
      },
    ],
  };
  vi.mocked(listUsers).mockResolvedValue({ data: [shared], pagination });
  mount();
  fireEvent.change(await screen.findByLabelText("Admin login email"), {
    target: { value: "changed@example.com" },
  });
  const save = screen.getByRole("button", {
    name: "Save login email",
  }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  expect(screen.getByText(/also linked to: Other Store/)).toBeTruthy();
  fireEvent.click(
    screen.getByRole("checkbox", { name: /across all its linked Stores/ }),
  );
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  await waitFor(() =>
    expect(updateStoreAdminEmail).toHaveBeenCalledWith(
      "token",
      shared,
      "store",
      "changed@example.com",
    ),
  );
});
it("keeps duplicate-email errors visible and retains the entered email", async () => {
  vi.mocked(updateStoreAdminEmail).mockRejectedValue(
    new SafeApiError(
      "USER_EMAIL_CONFLICT",
      "This login email is already used.",
      409,
    ),
  );
  mount();
  fireEvent.change(await screen.findByLabelText("Admin login email"), {
    target: { value: "duplicate@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save login email" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(
    (screen.getByLabelText("Admin login email") as HTMLInputElement).value,
  ).toBe("duplicate@example.com");
});
it("selects among multiple linked admins and protects a Superadmin account", async () => {
  const protectedAdmin = {
    ...admin,
    id: "protected",
    email: "super@example.com",
    isProtectedSuperadmin: true,
  };
  vi.mocked(listUsers).mockResolvedValue({
    data: [admin, protectedAdmin],
    pagination,
  });
  mount();
  await screen.findByLabelText("Admin login email");
  fireEvent.change(
    screen.getByRole("combobox", { name: "Store Admin account" }),
    {
      target: { value: "protected" },
    },
  );
  expect(
    (screen.getByLabelText("Admin login email") as HTMLInputElement).value,
  ).toBe(protectedAdmin.email);
  expect(
    (screen.getByLabelText("Admin login email") as HTMLInputElement).disabled,
  ).toBe(true);
  expect(screen.getByText(/Protected Superadmin accounts cannot/)).toBeTruthy();
});
it("assigns an existing account only after the exact Store name is confirmed", async () => {
  mount();
  await screen.findByLabelText("Admin login email");
  fireEvent.click(
    screen.getByRole("button", { name: "Assign existing account" }),
  );
  await screen.findByRole("option", {
    name: "Existing Staff — staff@example.com",
  });
  fireEvent.change(screen.getByLabelText("Existing account"), {
    target: { value: "candidate" },
  });
  const assign = screen.getByRole("button", {
    name: "Assign Store Admin",
  }) as HTMLButtonElement;
  expect(assign.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Type “Avinash stores” to confirm"), {
    target: { value: "Avinash stores" },
  });
  fireEvent.click(assign);
  await waitFor(() =>
    expect(assignStoreAdmin).toHaveBeenCalledWith(
      "token",
      candidate,
      "store",
      "Avinash stores",
    ),
  );
  expect(await screen.findByRole("status")).toBeTruthy();
  expect(updateStoreAdminEmail).not.toHaveBeenCalled();
});
it("supports ownerless Stores and server-side paginated candidate search", async () => {
  vi.mocked(listUsers).mockImplementation(async (_token, query) => ({
    data: query.role ? [] : [candidate],
    pagination: {
      ...pagination,
      total: query.role ? 0 : 50,
      totalPages: query.role ? 1 : 2,
    },
  }));
  mount();
  expect(
    await screen.findByText(/No Store Admin account is linked/),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Assign existing account" }),
  );
  fireEvent.change(
    screen.getByLabelText("Search account name or login email"),
    { target: { value: "staff@" } },
  );
  await waitFor(() =>
    expect(listUsers).toHaveBeenLastCalledWith(
      "token",
      expect.objectContaining({
        status: "ACTIVE",
        deleted: "active",
        search: "staff@",
        page: 1,
        pageSize: 25,
      }),
    ),
  );
  await screen.findByRole("option", {
    name: "Existing Staff — staff@example.com",
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Next Existing accounts" }),
  );
  await waitFor(() =>
    expect(listUsers).toHaveBeenLastCalledWith(
      "token",
      expect.objectContaining({ search: "staff@", page: 2 }),
    ),
  );
});
