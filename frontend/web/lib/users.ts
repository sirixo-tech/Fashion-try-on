import { selfxApi } from "@/lib/api";

export type UserRole = { id: string; name: string; isActive: boolean };
export type UserMembership = {
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
