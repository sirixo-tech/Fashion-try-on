import { selfxApi } from "@/lib/api";

export type UserRole = { id: string; name: string; isActive: boolean };
export type UserMembership = {
  deletedAt?: string | null;
  isStoreAdmin?: boolean;
  membershipId: string;
  storeId: string;
  storeName: string;
  storeStatus: string;
  membershipRole: string;
  status: string;
  storeScopeMode: string;
  updatedAt: string;
  roles: UserRole[];
};
export type ManagedUser = {
  deletedAt?: string | null;
  id: string;
  email: string;
  displayName: string | null;
  status: "ACTIVE" | "SUSPENDED" | "DISABLED";
  createdAt: string;
  updatedAt: string;
  version: string;
  isProtectedSuperadmin: boolean;
  staticPlatformRoles: string[];
  platformRoles: UserRole[];
  memberships: UserMembership[];
};
export type StoreOption = { id: string; name: string; status: string };
export type Paged<T> = {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
export type MembershipInput = {
  storeId: string;
  membershipId?: string;
  updatedAt?: string;
  status: "ACTIVE" | "SUSPENDED" | "REVOKED";
  roleIds: string[];
};
export type UpdateUserInput = {
  version: string;
  displayName: string;
  email: string;
  status: ManagedUser["status"];
  newPassword?: string;
  platformRoleIds?: string[];
  memberships: MembershipInput[];
};
export function listUsers(
  token: string,
  query: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    storeId?: string;
    access?: string;
    role?: string;
    deleted?: string;
  },
) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  return selfxApi<Paged<ManagedUser>>(`/api/v1/admin/users?${params}`, {
    accessToken: token,
  });
}
export function getUser(token: string, id: string) {
  return selfxApi<ManagedUser>(`/api/v1/admin/users/${id}`, {
    accessToken: token,
  });
}
export function updateUser(token: string, id: string, input: UpdateUserInput) {
  return selfxApi<ManagedUser>(`/api/v1/admin/users/${id}`, {
    method: "PATCH",
    accessToken: token,
    body: JSON.stringify(input),
  });
}
export function listUserStores(
  token: string,
  query: { page?: number; search?: string },
) {
  const params = new URLSearchParams({
    page: String(query.page ?? 1),
    pageSize: "25",
    search: query.search ?? "",
  });
  return selfxApi<Paged<StoreOption>>(`/api/v1/admin/users/stores?${params}`, {
    accessToken: token,
  });
}
export function assignFirstStoreOwner(
  token: string,
  id: string,
  input: { version: string; storeId: string; confirmStoreName: string },
) {
  return selfxApi<ManagedUser>(`/api/v1/admin/users/${id}/first-store-owner`, {
    method: "POST",
    accessToken: token,
    body: JSON.stringify(input),
  });
}

export function deleteUser(
  token: string,
  user: ManagedUser,
  confirmEmail: string,
) {
  return selfxApi<{ kind: "SOFT" | "HARD" }>(`/api/v1/admin/users/${user.id}`, {
    method: "DELETE",
    accessToken: token,
    body: JSON.stringify({ version: user.version, confirmEmail }),
  });
}
export function deleteStoreUser(
  token: string,
  storeId: string,
  membership: { membershipId: string; updatedAt: string },
  confirmEmail: string,
) {
  return selfxApi<{ kind: string; sharedAccountPreserved: boolean }>(
    `/api/v1/admin/stores/${storeId}/users/${membership.membershipId}`,
    {
      method: "DELETE",
      accessToken: token,
      body: JSON.stringify({ updatedAt: membership.updatedAt, confirmEmail }),
    },
  );
}
