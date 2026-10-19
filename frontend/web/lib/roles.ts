import { selfxApi } from "./api";
import type { AccessPermission, PlatformRole } from "./access-control";
import type { StoreRole, StorePermission } from "./stores";
export type RolesContext = {
  canViewPlatform: boolean;
  canEditPlatformAdmin: boolean;
  canEditPlatformStaff: boolean;
  assignablePlatformCodes: string[];
  roles: PlatformRole[];
  permissions: AccessPermission[];
  stores: {
    data: { id: string; name: string }[];
    page: number;
    total: number;
    hasMore: boolean;
  };
};
export type StoreRolesWorkspace = {
  canEditCeiling: boolean;
  ceilingUpdatedAt: string;
  roles: StoreRole[];
  permissions: StorePermission[];
  policy: {
    canView: boolean;
    canEditAdmin: boolean;
    canEditStaff: boolean;
    assignableCodes: string[];
    staffAssignableCodes: string[];
    requiredAdminCodes: string[];
  };
};
export const getRolesContext = (accessToken: string, page = 1, search = "") =>
  selfxApi<RolesContext>(
    `/api/v1/admin/roles?page=${page}&pageSize=25&search=${encodeURIComponent(search)}`,
    { accessToken, cache: "no-store" },
  );
export const getStoreRolesWorkspace = (accessToken: string, storeId: string) =>
  selfxApi<StoreRolesWorkspace>(`/api/v1/admin/roles/stores/${storeId}`, {
    accessToken,
    cache: "no-store",
  });
