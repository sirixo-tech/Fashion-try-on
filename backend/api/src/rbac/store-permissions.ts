export const STORE_PERMISSION_CODES = {
  storesView: "stores.view",
  storesUpdate: "stores.update",
  usersView: "users.view",
  usersInvite: "users.invite",
  usersUpdate: "users.update",
  usersDeactivate: "users.deactivate",
  rolesView: "roles.view",
  rolesCreate: "roles.create",
  rolesUpdate: "roles.update",
  rolesDelete: "roles.delete",
  rolesAssign: "roles.assign",
  kiosksView: "kiosks.view",
  kiosksPair: "kiosks.pair",
  kiosksUpdate: "kiosks.update",
  kiosksAssign: "kiosks.assign",
  kiosksConfigure: "kiosks.configure",
  kiosksRevoke: "kiosks.revoke",
  tryOnGarmentPreview: "tryon.garment_preview",
  analyticsView: "analytics.view",
  integrationsView: "integrations.view",
  developerApiView: "developer_api.view",
  developerApiManage: "developer_api.manage",
} as const;

export type StorePermissionCode =
  (typeof STORE_PERMISSION_CODES)[keyof typeof STORE_PERMISSION_CODES];

export type StorePermissionDefinition = {
  code: StorePermissionCode;
  module: string;
  action: string;
  label: string;
  description: string;
  applicability: "STORE";
};

export const STORE_PERMISSION_REGISTRY: readonly StorePermissionDefinition[] = [
  {
    code: STORE_PERMISSION_CODES.storesView,
    module: "stores",
    action: "view",
    label: "View Stores",
    description: "View Store details and Store-scoped operational data.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.storesUpdate,
    module: "stores",
    action: "update",
    label: "Update Stores",
    description: "Update Store profile and settings within authorized scope.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.usersView,
    module: "users",
    action: "view",
    label: "View Store Users",
    description: "View Store memberships and assigned roles.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.usersInvite,
    module: "users",
    action: "invite",
    label: "Add Store Users",
    description: "Add an existing user to a Store membership when authorized.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.usersUpdate,
    module: "users",
    action: "update",
    label: "Update Store Users",
    description: "Update Store membership status and membership metadata.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.usersDeactivate,
    module: "users",
    action: "deactivate",
    label: "Suspend Store Users",
    description: "Suspend or reactivate a Store membership.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.rolesView,
    module: "roles",
    action: "view",
    label: "View Store Roles",
    description: "View Store roles and permission counts.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.rolesCreate,
    module: "roles",
    action: "create",
    label: "Create Store Roles",
    description: "Create custom Store roles.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.rolesUpdate,
    module: "roles",
    action: "update",
    label: "Update Store Roles",
    description: "Update Store role metadata, status and permissions.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.rolesDelete,
    module: "roles",
    action: "delete",
    label: "Delete Store Roles",
    description: "Delete unused custom Store roles.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.rolesAssign,
    module: "roles",
    action: "assign",
    label: "Assign Store Roles",
    description: "Assign or remove roles on Store memberships.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.kiosksView,
    module: "kiosks",
    action: "view",
    label: "View Kiosks",
    description: "View kiosks owned by the Store.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.kiosksPair,
    module: "kiosks",
    action: "pair",
    label: "Pair Kiosks",
    description: "Pair new physical kiosks to a Store.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.kiosksUpdate,
    module: "kiosks",
    action: "update",
    label: "Update Kiosks",
    description: "Update kiosk metadata.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.kiosksAssign,
    module: "kiosks",
    action: "assign",
    label: "Assign Kiosks",
    description: "Assign existing kiosks to a Store.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.kiosksConfigure,
    module: "kiosks",
    action: "configure",
    label: "Configure Kiosks",
    description: "Update Store-owned kiosk runtime configuration.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.kiosksRevoke,
    module: "kiosks",
    action: "revoke",
    label: "Unpair Kiosks",
    description: "Unpair or revoke Store-owned kiosk device sessions.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.tryOnGarmentPreview,
    module: "tryon",
    action: "garment_preview",
    label: "Captured Garment Preview",
    description:
      "Allow this Store to use the captured garment extraction preview step.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.analyticsView,
    module: "analytics",
    action: "view",
    label: "View Analytics",
    description: "View Store-scoped analytics when analytics is implemented.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.integrationsView,
    module: "integrations",
    action: "view",
    label: "View Integrations",
    description:
      "View Store integration status when integrations are implemented.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.developerApiView,
    module: "developer_api",
    action: "view",
    label: "View Developer API",
    description: "View Store API keys for external integrations.",
    applicability: "STORE",
  },
  {
    code: STORE_PERMISSION_CODES.developerApiManage,
    module: "developer_api",
    action: "manage",
    label: "Manage Developer API",
    description: "Create and revoke Store API keys for external integrations.",
    applicability: "STORE",
  },
] as const;

export const STORE_PERMISSION_SET = new Set<string>(
  STORE_PERMISSION_REGISTRY.map((permission) => permission.code),
);

export function isStorePermissionCode(
  code: string,
): code is StorePermissionCode {
  return STORE_PERMISSION_SET.has(code);
}
