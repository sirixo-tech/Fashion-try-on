import { selfxApi } from "@/lib/api";

export type PermissionApplicability = "PLATFORM_ONLY" | "STORE" | "BOTH";

export type AccessPermission = {
  id: string;
  code: string;
  module: string;
  action: string;
  label: string;
  description: string | null;
  applicability: PermissionApplicability;
  isSystem: boolean;
};

export type PlatformRole = {
  id: string;
  name: string;
  description: string | null;
  systemCode: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissionsCount: number;
  assignedUsersCount: number;
  permissions: AccessPermission[];
  createdAt: string;
  updatedAt: string;
};

export type PlatformUser = {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  isProtectedSuperadmin: boolean;
  platformRoles: PlatformRole[];
};

export type StorePermissionGrant = AccessPermission & {
  granted: boolean;
};

export type CurrentPlatformAccess = {
  isSuperadmin: boolean;
  permissions: string[];
};

export function getCurrentPlatformAccess(
  accessToken: string,
): Promise<CurrentPlatformAccess> {
  return selfxApi<CurrentPlatformAccess>("/api/v1/admin/access/me", {
    accessToken,
  });
}

export function listAccessPermissions(
  accessToken: string,
): Promise<{ data: AccessPermission[] }> {
  return selfxApi<{ data: AccessPermission[] }>(
    "/api/v1/admin/access/permissions",
    { accessToken },
  );
}

export function listPlatformRoles(
  accessToken: string,
): Promise<{ data: PlatformRole[] }> {
  return selfxApi<{ data: PlatformRole[] }>("/api/v1/admin/access/roles", {
    accessToken,
  });
}

export function createPlatformRole(
  accessToken: string,
  input: { name: string; description?: string; permissionCodes?: string[] },
): Promise<PlatformRole> {
  return selfxApi<PlatformRole>("/api/v1/admin/access/roles", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

export function updatePlatformRole(
  accessToken: string,
  roleId: string,
  input: { name?: string; description?: string | null; isActive?: boolean },
): Promise<PlatformRole> {
  return selfxApi<PlatformRole>(`/api/v1/admin/access/roles/${roleId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  });
}

export function replacePlatformRolePermissions(
  accessToken: string,
  roleId: string,
  permissionCodes: string[],
): Promise<PlatformRole> {
  return selfxApi<PlatformRole>(
    `/api/v1/admin/access/roles/${roleId}/permissions`,
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify({ permissionCodes }),
    },
  );
}

export function listPlatformUsers(
  accessToken: string,
): Promise<{ data: PlatformUser[] }> {
  return selfxApi<{ data: PlatformUser[] }>("/api/v1/admin/access/users", {
    accessToken,
  });
}

export function addPlatformUser(
  accessToken: string,
  input: { email: string; roleIds?: string[] },
): Promise<PlatformUser> {
  return selfxApi<PlatformUser>("/api/v1/admin/access/users", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

export function replacePlatformUserRoles(
  accessToken: string,
  userId: string,
  roleIds: string[],
): Promise<PlatformUser> {
  return selfxApi<PlatformUser>(`/api/v1/admin/access/users/${userId}/roles`, {
    method: "PUT",
    accessToken,
    body: JSON.stringify({ roleIds }),
  });
}

export function listStorePermissionGrants(
  accessToken: string,
  storeId: string,
): Promise<{ data: StorePermissionGrant[] }> {
  return selfxApi<{ data: StorePermissionGrant[] }>(
    `/api/v1/admin/access/stores/${storeId}/permission-grants`,
    { accessToken },
  );
}

export function replaceStorePermissionGrants(
  accessToken: string,
  storeId: string,
  permissionCodes: string[],
): Promise<{ data: StorePermissionGrant[] }> {
  return selfxApi<{ data: StorePermissionGrant[] }>(
    `/api/v1/admin/access/stores/${storeId}/permission-grants`,
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify({ permissionCodes }),
    },
  );
}
