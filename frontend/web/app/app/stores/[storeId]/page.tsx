"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  PencilIcon,
  MonitorIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";

import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  PageContainer,
  PageHeader,
  PageSection,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import { replaceStorePermissionGrants } from "@/lib/access-control";
import {
  type KioskConfiguration,
  type KioskConfigurationAssetType,
  type KioskConfigurationUpdateInput,
  type KioskDevice,
} from "@/lib/kiosks";
import { useSession } from "@/lib/session";
import {
  activateStore,
  addStoreUser,
  createStoreRole,
  deleteStoreRole,
  deactivateStore,
  getEffectiveStorePermissions,
  getStore,
  getStoreKioskConfiguration,
  getStoreVirtualTryOnSettings,
  listStorePermissions,
  listStoreRoles,
  listStoreUsers,
  pairStoreKiosk,
  replaceStoreRolePermissions,
  replaceStoreUserRoles,
  updateStore,
  updateStoreKioskConfiguration,
  updateStoreRole,
  updateStoreVirtualTryOnSettings,
  updateStoreUserStatus,
  type AdminStoreDetail,
  type StorePermission,
  type StoreInput,
  type StoreRole,
  type StoreVirtualTryOnSettings,
  type StoreUser,
} from "@/lib/stores";

export default function StoreDashboardPage() {
  const params = useParams<{ storeId: string }>();
  const storeId = params.storeId;
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [store, setStore] = useState<AdminStoreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<StoreRole[]>([]);
  const [users, setUsers] = useState<StoreUser[]>([]);
  const [permissions, setPermissions] = useState<StorePermission[]>([]);
  const [permissionGrantCodes, setPermissionGrantCodes] = useState<string[]>(
    [],
  );
  const [storeTryOnSettings, setStoreTryOnSettings] =
    useState<StoreVirtualTryOnSettings | null>(null);
  const [effectivePermissions, setEffectivePermissions] = useState<string[]>(
    [],
  );
  const [platformBypass, setPlatformBypass] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [roleDialog, setRoleDialog] = useState<StoreRole | "new" | null>(null);
  const [userDialog, setUserDialog] = useState<StoreUser | "new" | null>(null);
  const [savingPermissionGrants, setSavingPermissionGrants] = useState(false);
  const [savingStoreTryOnSettings, setSavingStoreTryOnSettings] =
    useState(false);
  const [configurationDevice, setConfigurationDevice] =
    useState<KioskDevice | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextStore, nextEffectivePermissions, nextStoreTryOnSettings] =
        await Promise.all([
          getStore(accessToken, storeId),
          getEffectiveStorePermissions(accessToken, storeId),
          getStoreVirtualTryOnSettings(accessToken, storeId),
        ]);
      const nextEffectivePermissionCodes = nextEffectivePermissions.permissions;
      const canLoadRoles =
        hasStorePermission(nextEffectivePermissionCodes, "roles.view") ||
        hasStorePermission(nextEffectivePermissionCodes, "roles.assign") ||
        hasStorePermission(nextEffectivePermissionCodes, "users.invite");
      const canLoadUsers = hasStorePermission(
        nextEffectivePermissionCodes,
        "users.view",
      );
      const canLoadPermissionCatalog =
        hasStorePermission(nextEffectivePermissionCodes, "roles.view") ||
        hasStorePermission(nextEffectivePermissionCodes, "roles.create") ||
        hasStorePermission(nextEffectivePermissionCodes, "roles.update");
      const [nextRoles, nextUsers, nextPermissions] = await Promise.all([
        canLoadRoles
          ? listStoreRoles(accessToken, storeId, { pageSize: 100 })
          : Promise.resolve(emptyStoreList<StoreRole>()),
        canLoadUsers
          ? listStoreUsers(accessToken, storeId, { pageSize: 100 })
          : Promise.resolve(emptyStoreList<StoreUser>()),
        canLoadPermissionCatalog
          ? listStorePermissions(accessToken, storeId)
          : Promise.resolve({ data: [] as StorePermission[] }),
      ]);
      setStore(nextStore);
      setStoreTryOnSettings(nextStoreTryOnSettings);
      setRoles(nextRoles.data);
      setUsers(nextUsers.data);
      setPermissions(nextPermissions.data);
      setPermissionGrantCodes(
        nextPermissions.data
          .filter((permission) => permission.granted)
          .map((permission) => permission.code),
      );
      setEffectivePermissions(nextEffectivePermissionCodes);
      setPlatformBypass(nextEffectivePermissions.platformBypass);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const kiosks = store?.kiosks.data ?? [];
  const can = useCallback(
    (permission: string) => effectivePermissions.includes(permission),
    [effectivePermissions],
  );
  const canPairKiosks = can("kiosks.pair");
  const canConfigureKiosks = can("kiosks.configure");
  const canInviteUsers = can("users.invite");
  const canAssignRoles = can("roles.assign");
  const canDeactivateUsers = can("users.deactivate");
  const canManageUsers = canAssignRoles || canDeactivateUsers;
  const canCreateRoles = can("roles.create");
  const canUpdateRoles = can("roles.update");
  const canDeleteRoles = can("roles.delete");
  const canUpdateStore = can("stores.update");
  const garmentPreviewControlDisabled =
    !canUpdateStore ||
    savingStoreTryOnSettings ||
    !storeTryOnSettings?.platformGarmentPreviewEnabled ||
    !storeTryOnSettings.storeHasGarmentPreviewPermission;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Store Dashboard"
        title={store?.name ?? "Store"}
        description={
          store
            ? storeLocation(store) || "Manage Store kiosks."
            : "Manage Store kiosks."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button render={<Link href="/app/stores" />} variant="outline">
              <ArrowLeftIcon aria-hidden="true" />
              Stores
            </Button>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            <Button
              onClick={() => setPairOpen(true)}
              disabled={!store || !canPairKiosks}
            >
              <PlusIcon aria-hidden="true" />
              Pair Kiosk
            </Button>
          </div>
        }
        status={
          store ? (
            <StatusBadge status={store.status} label={store.status} />
          ) : null
        }
      />

      {error ? (
        <PageSection>
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <ShieldAlertIcon size={18} aria-hidden="true" />
            {error}
          </div>
        </PageSection>
      ) : null}

      <PageSection>
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Total Kiosks" value={store?.totalKiosks ?? 0} />
          <MetricCard label="Active Kiosks" value={store?.activeKiosks ?? 0} />
          <MetricCard
            label="Last Activity"
            value={formatDate(store?.lastActivityAt ?? null)}
          />
          <MetricCard label="Configurable" value={kiosks.length} />
        </div>
      </PageSection>

      <PageSection>
        <div className="grid gap-5 lg:grid-cols-[1.5fr_0.75fr]">
          <TableContainer
            title="Store Kiosks"
            description="Kiosks assigned to this Store. Configuration remains attached to each kiosk device."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6}>Loading Store kiosks...</TableCell>
                  </TableRow>
                ) : kiosks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="flex items-center gap-3 py-8 text-muted-foreground">
                        <MonitorIcon size={20} aria-hidden="true" />
                        No kiosks are paired to this Store yet.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  kiosks.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell>
                        <div className="font-medium">{device.displayName}</div>
                        <div className="text-xs text-muted-foreground">
                          {device.id}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={device.status}
                          label={device.status}
                        />
                      </TableCell>
                      <TableCell>
                        {device.platform ?? "Unknown"}
                        {device.appVersion ? ` / ${device.appVersion}` : ""}
                      </TableCell>
                      <TableCell>
                        v{device.latestConfigurationVersion}
                      </TableCell>
                      <TableCell>{formatDate(device.lastSeenAt)}</TableCell>
                      <TableCell className="text-right">
                        {canConfigureKiosks ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfigurationDevice(device)}
                          >
                            <SettingsIcon aria-hidden="true" />
                            Manage
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TableContainer title="Store Settings" description="Store details">
            {store ? (
              <div className="space-y-4 text-sm">
                <DetailRow label="Slug" value={`/${store.slug}`} />
                <DetailRow label="Contact" value={store.contactEmail ?? "-"} />
                <DetailRow label="Phone" value={store.contactPhone ?? "-"} />
                <DetailRow label="Website" value={store.website ?? "-"} />
                <DetailRow label="Timezone" value={store.timezone} />
                {storeTryOnSettings ? (
                  <div className="rounded-lg border p-3">
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Virtual Try-On
                    </div>
                    <label className="mt-3 flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={storeTryOnSettings.storeGarmentPreviewEnabled}
                        disabled={garmentPreviewControlDisabled}
                        onChange={(event) =>
                          void updateStoreGarmentPreview(
                            event.target.checked,
                          )
                        }
                      />
                      <span>
                        <span className="block font-medium">
                          Captured Garment Preview
                        </span>
                        <span className="block text-muted-foreground">
                          Show an extracted garment preview after a garment is
                          photographed.
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Effective:{" "}
                          {storeTryOnSettings.effectiveGarmentPreviewEnabled
                            ? "On"
                            : "Off"}
                          {!storeTryOnSettings.platformGarmentPreviewEnabled
                            ? " - disabled globally"
                            : !storeTryOnSettings.storeHasGarmentPreviewPermission
                              ? " - feature not granted"
                              : ""}
                        </span>
                      </span>
                    </label>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-2">
                  {canUpdateStore ? (
                    <Button variant="outline" onClick={() => setEditOpen(true)}>
                      Edit Store
                    </Button>
                  ) : null}
                  {platformBypass && store.status === "ACTIVE" ? (
                    <ConfirmDialog
                      title="Deactivate Store?"
                      description="The Store remains stored and kiosk records/configuration are not deleted. Inactive Stores cannot receive new kiosk assignments."
                      confirmLabel="Deactivate"
                      destructive
                      onConfirm={() => void changeStoreStatus("INACTIVE")}
                      trigger={
                        <Button variant="destructive">Deactivate</Button>
                      }
                    />
                  ) : platformBypass ? (
                    <Button onClick={() => void changeStoreStatus("ACTIVE")}>
                      Reactivate
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </TableContainer>
        </div>
      </PageSection>

      <PageSection>
        <TableContainer
          title="Store Permissions"
          description="SelfX-granted permission ceiling for this Store. Store roles can only delegate granted permissions."
          actions={
            platformBypass ? (
              <Button
                disabled={savingPermissionGrants}
                onClick={() => void savePermissionGrants()}
              >
                Save Grants
              </Button>
            ) : null
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Permission</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3}>
                    Loading Store permissions...
                  </TableCell>
                </TableRow>
              ) : permissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3}>
                    Store permission visibility is unavailable for this user.
                  </TableCell>
                </TableRow>
              ) : (
                permissions.map((permission) => (
                  <TableRow key={permission.id}>
                    <TableCell>
                      {platformBypass ? (
                        <input
                          type="checkbox"
                          className="mr-3 align-middle"
                          checked={permissionGrantCodes.includes(
                            permission.code,
                          )}
                          onChange={(event) =>
                            setPermissionGrantCodes((current) =>
                              event.target.checked
                                ? [...current, permission.code]
                                : current.filter(
                                    (code) => code !== permission.code,
                                  ),
                            )
                          }
                        />
                      ) : null}
                      <div className="font-medium">{permission.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {permission.code}
                      </div>
                    </TableCell>
                    <TableCell>{permission.module}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={permission.granted ? "GRANTED" : "UNAVAILABLE"}
                        label={permission.granted ? "Granted" : "Unavailable"}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </PageSection>

      <PageSection>
        <div className="grid gap-5 xl:grid-cols-2">
          <TableContainer
            title="Store Users"
            description="Store memberships and assigned Store roles. Email invitations are deferred in RBAC-1."
          >
            <div className="mb-4 flex justify-end">
              {canInviteUsers ? (
                <Button onClick={() => setUserDialog("new")}>
                  <UserPlusIcon aria-hidden="true" />
                  Add User
                </Button>
              ) : null}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4}>Loading Store users...</TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <div className="flex items-center gap-3 py-8 text-muted-foreground">
                        <UsersIcon size={20} aria-hidden="true" />
                        No Store users are assigned yet.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.membershipId}>
                      <TableCell>
                        <div className="font-medium">
                          {user.displayName ?? user.email}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {user.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={user.status} label={user.status} />
                      </TableCell>
                      <TableCell>
                        {user.roles.length > 0
                          ? user.roles.map((role) => role.name).join(", ")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManageUsers ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            {canAssignRoles ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setUserDialog(user)}
                              >
                                <PencilIcon aria-hidden="true" />
                                Roles
                              </Button>
                            ) : null}
                            {canDeactivateUsers ? (
                              <Button
                                variant={
                                  user.status === "ACTIVE"
                                    ? "destructive"
                                    : "outline"
                                }
                                size="sm"
                                onClick={() => void toggleUserStatus(user)}
                              >
                                {user.status === "ACTIVE"
                                  ? "Suspend"
                                  : "Activate"}
                              </Button>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TableContainer
            title="Store Roles"
            description="Store roles group granted permissions for Store-managed staff."
          >
            <div className="mb-4 flex justify-end">
              {canCreateRoles ? (
                <Button onClick={() => setRoleDialog("new")}>
                  <ShieldCheckIcon aria-hidden="true" />
                  Add Role
                </Button>
              ) : null}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4}>Loading Store roles...</TableCell>
                  </TableRow>
                ) : roles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <div className="flex items-center gap-3 py-8 text-muted-foreground">
                        <ShieldCheckIcon size={20} aria-hidden="true" />
                        No Store roles are configured yet.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  roles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell>
                        <div className="font-medium">{role.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {role.isSystem ? "System" : "Custom"}
                          {!role.isActive ? " / inactive" : ""}
                        </div>
                      </TableCell>
                      <TableCell>{role.permissionsCount}</TableCell>
                      <TableCell>{role.assignedUsersCount}</TableCell>
                      <TableCell className="text-right">
                        {canUpdateRoles ||
                        (canDeleteRoles && !role.isSystem) ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            {canUpdateRoles ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRoleDialog(role)}
                              >
                                <PencilIcon aria-hidden="true" />
                                Edit
                              </Button>
                            ) : null}
                            {canDeleteRoles && !role.isSystem ? (
                              <ConfirmDialog
                                title="Delete Store role?"
                                description="This deletes the role only if no Store users are assigned to it."
                                confirmLabel="Delete"
                                destructive
                                onConfirm={() => void removeRole(role)}
                                trigger={
                                  <Button variant="outline" size="sm">
                                    <Trash2Icon aria-hidden="true" />
                                    Delete
                                  </Button>
                                }
                              />
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      </PageSection>

      <PairStoreKioskDialog
        open={pairOpen}
        disabled={store?.status !== "ACTIVE"}
        onOpenChange={setPairOpen}
        onSubmit={async (input) => {
          if (!accessToken || !store) {
            return;
          }
          await pairStoreKiosk(accessToken, store.id, input);
          setPairOpen(false);
          await load();
        }}
      />

      {store ? (
        <EditStoreDialog
          open={editOpen}
          store={store}
          onOpenChange={setEditOpen}
          onSubmit={async (input) => {
            if (!accessToken) {
              return;
            }
            await updateStore(accessToken, store.id, input);
            setEditOpen(false);
            await load();
          }}
        />
      ) : null}

      <StoreKioskConfigurationDialog
        device={configurationDevice}
        accessToken={accessToken}
        storeId={storeId}
        onOpenChange={(open) => {
          if (!open) {
            setConfigurationDevice(null);
          }
        }}
        onSaved={(configuration) => {
          setStore((current) =>
            current
              ? {
                  ...current,
                  kiosks: {
                    data: current.kiosks.data.map((device) =>
                      device.id === configurationDevice?.id
                        ? {
                            ...device,
                            latestConfigurationVersion: configuration.version,
                          }
                        : device,
                    ),
                  },
                }
              : current,
          );
        }}
      />

      <StoreRoleDialog
        role={roleDialog}
        roles={roles}
        permissions={permissions}
        onOpenChange={(open) => {
          if (!open) {
            setRoleDialog(null);
          }
        }}
        onSubmit={async (input) => {
          if (!accessToken || !store) {
            return;
          }
          if (roleDialog === "new") {
            await createStoreRole(accessToken, store.id, input);
          } else if (roleDialog) {
            await updateStoreRole(accessToken, store.id, roleDialog.id, {
              name: input.name,
              description: input.description ?? null,
              isActive: input.isActive,
            });
            if (!roleDialog.isSystem) {
              await replaceStoreRolePermissions(
                accessToken,
                store.id,
                roleDialog.id,
                input.permissionCodes,
              );
            }
          }
          setRoleDialog(null);
          await load();
        }}
      />

      <StoreUserDialog
        user={userDialog}
        roles={roles.filter((role) => role.isActive)}
        onOpenChange={(open) => {
          if (!open) {
            setUserDialog(null);
          }
        }}
        onSubmit={async (input) => {
          if (!accessToken || !store) {
            return;
          }
          if (userDialog === "new") {
            await addStoreUser(accessToken, store.id, input);
          } else if (userDialog) {
            await replaceStoreUserRoles(
              accessToken,
              store.id,
              userDialog.membershipId,
              input.roleIds,
            );
          }
          setUserDialog(null);
          await load();
        }}
      />
    </PageContainer>
  );

  async function changeStoreStatus(nextStatus: "ACTIVE" | "INACTIVE") {
    if (!accessToken || !store) {
      return;
    }
    setError(null);
    try {
      const updated =
        nextStatus === "ACTIVE"
          ? await activateStore(accessToken, store.id)
          : await deactivateStore(accessToken, store.id);
      setStore((current) => (current ? { ...current, ...updated } : current));
    } catch (caught) {
      setError(messageFor(caught));
    }
  }

  async function toggleUserStatus(user: StoreUser) {
    if (!accessToken || !store) {
      return;
    }
    setError(null);
    try {
      await updateStoreUserStatus(
        accessToken,
        store.id,
        user.membershipId,
        user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
      );
      await load();
    } catch (caught) {
      setError(messageFor(caught));
    }
  }

  async function removeRole(role: StoreRole) {
    if (!accessToken || !store) {
      return;
    }
    setError(null);
    try {
      await deleteStoreRole(accessToken, store.id, role.id);
      await load();
    } catch (caught) {
      setError(messageFor(caught));
    }
  }

  async function savePermissionGrants() {
    if (!accessToken || !store) {
      return;
    }
    setSavingPermissionGrants(true);
    setError(null);
    try {
      const response = await replaceStorePermissionGrants(
        accessToken,
        store.id,
        permissionGrantCodes,
      );
      const granted = response.data
        .filter((permission) => permission.granted)
        .map((permission) => permission.code);
      setPermissionGrantCodes(granted);
      await load();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSavingPermissionGrants(false);
    }
  }

  async function updateStoreGarmentPreview(enabled: boolean) {
    if (!accessToken || !store) {
      return;
    }
    setSavingStoreTryOnSettings(true);
    setError(null);
    try {
      setStoreTryOnSettings(
        await updateStoreVirtualTryOnSettings(accessToken, store.id, {
          garmentPreviewEnabled: enabled,
        }),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSavingStoreTryOnSettings(false);
    }
  }
}

function StoreKioskConfigurationDialog({
  device,
  accessToken,
  storeId,
  onOpenChange,
  onSaved,
}: {
  device: KioskDevice | null;
  accessToken: string | null;
  storeId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (configuration: KioskConfiguration) => void;
}) {
  const open = device !== null;
  const [configuration, setConfiguration] = useState<KioskConfiguration | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!device || !accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await getStoreKioskConfiguration(
        accessToken,
        storeId,
        device.id,
      );
      setConfiguration(next);
      setTitle(next.display.title ?? "");
      setCtaLabel(next.display.ctaLabel);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, device, storeId]);

  useEffect(() => {
    if (open) {
      void load();
    } else {
      setConfiguration(null);
      setError(null);
    }
  }, [load, open]);

  async function save() {
    if (!device || !accessToken || !configuration) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateStoreKioskConfiguration(
        accessToken,
        storeId,
        device.id,
        configurationUpdateInput(configuration, {
          title: title.trim() || null,
          ctaLabel: ctaLabel.trim() || "Start Try-On",
        }),
      );
      setConfiguration(updated);
      onSaved(updated);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Store Kiosk Configuration</DialogTitle>
          <DialogDescription>
            {device
              ? `${device.displayName} runtime settings for this Store.`
              : "Runtime settings for this Store."}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {loading ? (
          <div className="py-8 text-sm text-muted-foreground">
            Loading Store kiosk configuration...
          </div>
        ) : configuration ? (
          <div className="space-y-4">
            <DetailRow
              label="Current Version"
              value={`v${configuration.version}`}
            />
            <DetailRow
              label="Presentation Assets"
              value={String(configuration.display.assets.length)}
            />
            <label className="space-y-2 text-sm">
              <span>Display Title</span>
              <Input
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span>CTA Label</span>
              <Input
                value={ctaLabel}
                maxLength={40}
                onChange={(event) => setCtaLabel(event.target.value)}
              />
            </label>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            disabled={loading || saving || !configuration}
            onClick={() => void save()}
          >
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StoreRoleDialog({
  role,
  permissions,
  onOpenChange,
  onSubmit,
}: {
  role: StoreRole | "new" | null;
  roles: StoreRole[];
  permissions: StorePermission[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    name: string;
    description?: string;
    isActive: boolean;
    permissionCodes: string[];
  }) => Promise<void>;
}) {
  const open = role !== null;
  const editingRole = role && role !== "new" ? role : null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [permissionCodes, setPermissionCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const grantedCodes = new Set(
      permissions
        .filter((permission) => permission.granted)
        .map((permission) => permission.code),
    );
    setName(editingRole?.name ?? "");
    setDescription(editingRole?.description ?? "");
    setIsActive(editingRole?.isActive ?? true);
    setPermissionCodes(
      editingRole?.permissions
        .map((permission) => permission.code)
        .filter((code) => grantedCodes.has(code)) ?? [],
    );
    setError(null);
  }, [editingRole, permissions, role]);

  const groupedPermissions = groupPermissions(permissions);
  const permissionsLocked = Boolean(editingRole?.isSystem);

  async function submit() {
    if (!name.trim()) {
      setError("Role name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name,
        description,
        isActive,
        permissionCodes,
      });
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {role === "new" ? "Add Store Role" : "Edit Store Role"}
          </DialogTitle>
          <DialogDescription>
            Permissions are stable backend codes with readable labels for Store
            administration.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <div className="grid max-h-[65vh] gap-5 overflow-y-auto pr-1 md:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4">
            <label className="space-y-2 text-sm">
              <span>Role Name *</span>
              <Input
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span>Description</span>
              <Input
                value={description}
                maxLength={500}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            {editingRole ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isActive}
                  disabled={editingRole.isSystem}
                  onChange={(event) => setIsActive(event.target.checked)}
                />
                Active
              </label>
            ) : null}
            {permissionsLocked ? (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                System role permission maps are protected in RBAC-1.
              </div>
            ) : null}
          </div>
          <div className="space-y-4">
            {groupedPermissions.map(([module, modulePermissions]) => (
              <fieldset
                key={module}
                className="space-y-2 rounded-lg border p-3"
              >
                <legend className="px-1 text-sm font-semibold capitalize">
                  {module}
                </legend>
                {modulePermissions.map((permission) => {
                  const unavailable = !permission.granted;
                  return (
                    <label
                      key={permission.code}
                      className="flex gap-3 rounded-md p-2 text-sm hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        disabled={permissionsLocked || unavailable}
                        checked={permissionCodes.includes(permission.code)}
                        onChange={(event) =>
                          setPermissionCodes((current) =>
                            event.target.checked
                              ? [...current, permission.code]
                              : current.filter(
                                  (code) => code !== permission.code,
                                ),
                          )
                        }
                      />
                      <span className={unavailable ? "opacity-60" : undefined}>
                        <span className="block font-medium">
                          {permission.label}
                        </span>
                        {permission.description ? (
                          <span className="block text-xs text-muted-foreground">
                            {permission.description}
                          </span>
                        ) : null}
                        {unavailable ? (
                          <span className="block text-xs text-muted-foreground">
                            Not granted to this Store
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={submitting || !name.trim()}
            onClick={() => void submit()}
          >
            Save Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StoreUserDialog({
  user,
  roles,
  onOpenChange,
  onSubmit,
}: {
  user: StoreUser | "new" | null;
  roles: StoreRole[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { email: string; roleIds: string[] }) => Promise<void>;
}) {
  const open = user !== null;
  const editingUser = user && user !== "new" ? user : null;
  const [email, setEmail] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setEmail(editingUser?.email ?? "");
    setRoleIds(editingUser?.roles.map((role) => role.id) ?? []);
    setError(null);
  }, [editingUser, user]);

  async function submit() {
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ email, roleIds });
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {user === "new" ? "Add Store User" : "Edit User Roles"}
          </DialogTitle>
          <DialogDescription>
            RBAC-1 supports adding existing SelfX users. Email invitations are
            deferred.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <div className="space-y-4">
          <label className="space-y-2 text-sm">
            <span>Email *</span>
            <Input
              value={email}
              disabled={Boolean(editingUser)}
              maxLength={320}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Assigned Roles</legend>
            {roles.length === 0 ? (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                No active Store roles are available.
              </div>
            ) : (
              roles.map((role) => (
                <label
                  key={role.id}
                  className="flex gap-3 rounded-md p-2 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={roleIds.includes(role.id)}
                    onChange={(event) =>
                      setRoleIds((current) =>
                        event.target.checked
                          ? [...current, role.id]
                          : current.filter((id) => id !== role.id),
                      )
                    }
                  />
                  <span>
                    <span className="block font-medium">{role.name}</span>
                    {role.description ? (
                      <span className="block text-xs text-muted-foreground">
                        {role.description}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))
            )}
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={submitting || !email.trim()}
            onClick={() => void submit()}
          >
            Save User
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 break-words">{value}</div>
    </div>
  );
}

function PairStoreKioskDialog({
  open,
  disabled,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    pairingCode: string;
    displayName: string;
  }) => Promise<void>;
}) {
  const [pairingCode, setPairingCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const canonicalCode = pairingCode.replace(/\s/g, "");
    if (!/^\d{6}$/.test(canonicalCode)) {
      setError("Pairing code expired or invalid.");
      return;
    }
    if (!displayName.trim()) {
      setError("Device name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ pairingCode: canonicalCode, displayName });
      setPairingCode("");
      setDisplayName("");
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pair Kiosk</DialogTitle>
          <DialogDescription>
            Enter the six-digit code shown on the physical kiosk. This kiosk
            will be assigned to this Store automatically.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {disabled ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            Inactive Stores cannot receive new kiosk assignments.
          </div>
        ) : null}
        <div className="space-y-4">
          <label className="space-y-2 text-sm">
            <span>Pairing Code</span>
            <Input
              value={pairingCode}
              inputMode="numeric"
              placeholder="482731"
              maxLength={7}
              onChange={(event) => setPairingCode(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Device Name</span>
            <Input
              value={displayName}
              maxLength={160}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={disabled || submitting || !displayName.trim()}
            onClick={() => void submit()}
          >
            Pair
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditStoreDialog({
  open,
  store,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  store: AdminStoreDetail;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: StoreInput) => Promise<void>;
}) {
  const [name, setName] = useState(store.name);
  const [contactEmail, setContactEmail] = useState(store.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(store.contactPhone ?? "");
  const [website, setWebsite] = useState(store.website ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim()) {
      setError("Store name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(
        cleanStoreInput({
          name,
          contactEmail,
          contactPhone,
          website,
          timezone: store.timezone,
        }),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Store</DialogTitle>
          <DialogDescription>Update Store details.</DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <div className="space-y-4">
          <label className="space-y-2 text-sm">
            <span>Store Name *</span>
            <Input
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Contact Email</span>
            <Input
              value={contactEmail}
              maxLength={254}
              onChange={(event) => setContactEmail(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Contact Phone</span>
            <Input
              value={contactPhone}
              maxLength={40}
              onChange={(event) => setContactPhone(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Website</span>
            <Input
              value={website}
              maxLength={2048}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={submitting} onClick={() => void submit()}>
            Save Store
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function configurationUpdateInput(
  configuration: KioskConfiguration,
  overrides: { title: string | null; ctaLabel: string },
): KioskConfigurationUpdateInput {
  return {
    display: {
      idleMode: configuration.display.idleMode,
      slideDurationSeconds: configuration.display.slideDurationSeconds,
      title: overrides.title,
      subtitle: configuration.display.subtitle,
      ctaLabel: overrides.ctaLabel,
      assets: configuration.display.assets.map((asset) => ({
        type: asset.type as KioskConfigurationAssetType,
        label: asset.label,
        ...(asset.url ? { url: asset.url } : {}),
        ...(asset.bundledAssetKey
          ? { bundledAssetKey: asset.bundledAssetKey }
          : {}),
        ...(asset.assetRef ? { assetRef: asset.assetRef } : {}),
        ...(asset.contentType ? { contentType: asset.contentType } : {}),
        ...(asset.sizeBytes ? { sizeBytes: asset.sizeBytes } : {}),
      })),
    },
    capture: {
      countdownSeconds: configuration.capture.countdownSeconds,
      soundEnabled: configuration.capture.soundEnabled,
      soundProfile: configuration.capture.soundProfile,
      guidanceAudioEnabled: configuration.capture.guidanceAudioEnabled,
    },
    experience: {
      enabledGarmentIntents: configuration.experience.enabledGarmentIntents,
      sessionIdleTimeoutSeconds:
        configuration.experience.sessionIdleTimeoutSeconds,
    },
  };
}

function cleanStoreInput(input: StoreInput): StoreInput {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      typeof value === "string" ? value.trim() !== "" : value !== undefined,
    ),
  ) as StoreInput;
}

function storeLocation(store: AdminStoreDetail): string {
  return [store.city, store.stateRegion, store.country]
    .filter(Boolean)
    .join(", ");
}

function groupPermissions(
  permissions: StorePermission[],
): Array<[string, StorePermission[]]> {
  const groups = new Map<string, StorePermission[]>();
  for (const permission of permissions) {
    const group = groups.get(permission.module) ?? [];
    group.push(permission);
    groups.set(permission.module, group);
  }
  return [...groups.entries()].map(([module, modulePermissions]) => [
    module,
    modulePermissions.sort((a, b) => a.label.localeCompare(b.label)),
  ]);
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "-";
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  return "The Store request could not be completed.";
}

function hasStorePermission(
  permissions: string[],
  permission: string,
): boolean {
  return permissions.includes(permission);
}

function emptyStoreList<T>() {
  return {
    data: [] as T[],
    pagination: {
      page: 1,
      pageSize: 100,
      total: 0,
      totalPages: 1,
      hasMore: false,
    },
  };
}
