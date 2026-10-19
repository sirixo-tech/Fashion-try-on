import { selfxApi } from "./api";
import type { AccessPermission, PlatformRole } from "./access-control";
import type { StorePermission } from "./stores";
export type RolesContext = {
  canViewPlatform: boolean;
  canEditPlatformAdmin: boolean;
  canEditPlatformStaff: boolean;
  assignablePlatformCodes: string[];
  roles: PlatformRole[];
  permissions: AccessPermission[];
  storeRoles: GlobalStoreRolesWorkspace;
};
export type GlobalStoreRolesWorkspace = {
  canEdit: boolean;
  roles: {
    id: string;
    systemCode: string;
    name: string;
    description: string | null;
    permissions: { code: string }[];
    updatedAt: string;
    assignedUsersCount: number | null;
  }[];
  permissions: StorePermission[];
  staffAssignableCodes: string[];
  requiredAdminCodes: string[];
};
export const getRolesContext = (accessToken: string) =>
  selfxApi<RolesContext>("/api/v1/admin/roles", {
    accessToken,
    cache: "no-store",
  });
export const replaceGlobalStoreRolePermissions = (
  accessToken: string,
  systemCode: string,
  permissionCodes: string[],
  expectedUpdatedAt: string,
) =>
  selfxApi<GlobalStoreRolesWorkspace>(
    `/api/v1/admin/roles/store-roles/${systemCode}/permissions`,
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify({ permissionCodes, expectedUpdatedAt }),
    },
  );
