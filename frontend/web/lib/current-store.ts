import { selfxApi } from "@/lib/api";
import type { TenantOrganization } from "@/lib/organizations";
import type {
  EffectiveStorePermissions,
  StoreImpersonationSession,
} from "@/lib/stores";

export type CurrentStore = Pick<
  TenantOrganization,
  "id" | "name" | "status"
>;

export type CurrentStoreAccess = {
  store: CurrentStore | null;
  permissions: EffectiveStorePermissions | null;
  hasMultipleStores: boolean;
  impersonation: StoreImpersonationSession | null;
};

type CurrentStoreResponse = {
  store: TenantOrganization | null;
  permissions: EffectiveStorePermissions | null;
  hasMultipleStores: boolean;
  impersonation: StoreImpersonationSession | null;
};

export async function getCurrentMerchantStore(
  accessToken: string,
): Promise<CurrentStore | null> {
  const response = await getCurrentMerchantStoreAccess(accessToken);
  return response.store;
}

export async function getCurrentMerchantStoreAccess(
  accessToken: string,
): Promise<CurrentStoreAccess> {
  const response = await selfxApi<CurrentStoreResponse>(
    "/api/v1/organizations/current-store",
    { accessToken },
  );

  return {
    store: response.store
      ? {
          id: response.store.id,
          name: response.store.name,
          status: response.store.status,
        }
      : null,
    permissions: response.permissions,
    hasMultipleStores: response.hasMultipleStores,
    impersonation: response.impersonation,
  };
}

export function hasCurrentStorePermission(
  permissions: EffectiveStorePermissions | null,
  requiredPermissions: string[],
): boolean {
  if (!permissions) {
    return false;
  }

  return (
    permissions.platformBypass ||
    requiredPermissions.some((permission) =>
      permissions.permissions.includes(permission),
    )
  );
}
