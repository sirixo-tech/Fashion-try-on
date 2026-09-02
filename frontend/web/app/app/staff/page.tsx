"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PencilIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  StoreIcon,
  UserCogIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PageContainer,
  PageHeader,
  PageSection,
  SelectMenu,
  StatCard,
  StatGrid,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@selfx/ui";

import {
  addPlatformUser,
  getCurrentPlatformAccess,
  listPlatformRoles,
  listPlatformUsers,
  replacePlatformUserRoles,
  type CurrentPlatformAccess,
  type PlatformRole,
  type PlatformUser,
} from "@/lib/access-control";
import { SafeApiError } from "@/lib/api";
import { listActiveOrganizations } from "@/lib/organizations";
import { useSession } from "@/lib/session";
import {
  addStoreUser,
  getEffectiveStorePermissions,
  listStoreRoles,
  listStoreUsers,
  listStores,
  replaceStoreUserRoles,
  updateStoreUserStatus,
  type AdminStore,
  type EffectiveStorePermissions,
  type StoreRole,
  type StoreUser,
} from "@/lib/stores";

type StaffScope = "platform" | "store";
type StoreOption = { id: string; name: string };

export default function StaffPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [scope, setScope] = useState<StaffScope>("store");
  const [storeId, setStoreId] = useState("");
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [platformAccess, setPlatformAccess] =
    useState<CurrentPlatformAccess | null>(null);
  const [storeAccess, setStoreAccess] =
    useState<EffectiveStorePermissions | null>(null);
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
  const [platformRoles, setPlatformRoles] = useState<PlatformRole[]>([]);
  const [storeUsers, setStoreUsers] = useState<StoreUser[]>([]);
  const [storeRoles, setStoreRoles] = useState<StoreRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformDialogUser, setPlatformDialogUser] = useState<
    PlatformUser | "new" | null
  >(null);
  const [storeDialogUser, setStoreDialogUser] = useState<
    StoreUser | "new" | null
  >(null);

  const platformPermissions = platformAccess?.permissions ?? [];
  const canViewPlatformUsers = Boolean(
    platformAccess?.isSuperadmin ||
      platformPermissions.includes("PERMISSIONS_VIEW") ||
      platformPermissions.includes("PERMISSIONS_MANAGE") ||
      platformPermissions.includes("PLATFORM_USERS_MANAGE"),
  );
  const canManagePlatformUsers = Boolean(
    platformAccess?.isSuperadmin ||
      platformPermissions.includes("PERMISSIONS_MANAGE") ||
      platformPermissions.includes("PLATFORM_USERS_MANAGE"),
  );
  const canViewStoreStaffGlobally = Boolean(
    platformAccess?.isSuperadmin ||
      platformPermissions.includes("STORE_USERS_VIEW") ||
      platformPermissions.includes("STORE_USERS_MANAGE"),
  );
  const canManageStoreStaffGlobally = Boolean(
    platformAccess?.isSuperadmin ||
      platformPermissions.includes("STORE_USERS_MANAGE"),
  );
  const canViewStoreRolesGlobally = Boolean(
    platformAccess?.isSuperadmin ||
      platformPermissions.includes("STORE_ROLES_VIEW") ||
      platformPermissions.includes("STORE_ROLES_MANAGE"),
  );

  const storePermissions = storeAccess?.permissions ?? [];
  const hasStoreBypass = storeAccess?.platformBypass ?? false;
  const canViewSelectedStoreStaff = Boolean(
    hasStoreBypass ||
      canViewStoreStaffGlobally ||
      storePermissions.includes("users.view"),
  );
  const canInviteSelectedStoreStaff = Boolean(
    hasStoreBypass ||
      canManageStoreStaffGlobally ||
      storePermissions.includes("users.invite"),
  );
  const canUpdateSelectedStoreStaff = Boolean(
    hasStoreBypass ||
      canManageStoreStaffGlobally ||
      storePermissions.includes("users.deactivate") ||
      storePermissions.includes("users.update"),
  );
  const canAssignSelectedStoreRoles = Boolean(
    hasStoreBypass ||
      canManageStoreStaffGlobally ||
      storePermissions.includes("roles.assign"),
  );
  const canLoadSelectedStoreRoles = Boolean(
    hasStoreBypass ||
      canViewStoreRolesGlobally ||
      storePermissions.includes("roles.view"),
  );

  const selectedStoreName = useMemo(
    () =>
      storeOptions.find((store) => store.id === storeId)?.name ??
      "Selected Store",
    [storeId, storeOptions],
  );

  useEffect(() => {
    if (!accessToken) {
      setPlatformAccess(null);
      setStoreOptions([]);
      setStoreId("");
      return;
    }

    const token = accessToken;
    let cancelled = false;

    async function loadAccess() {
      setError(null);
      try {
        const nextAccess = await getCurrentPlatformAccess(token);
        if (cancelled) {
          return;
        }
        setPlatformAccess(nextAccess);

        if (
          nextAccess.isSuperadmin ||
          nextAccess.permissions.includes("STORES_VIEW")
        ) {
          const stores = await listStores(token, { pageSize: 100 });
          if (!cancelled) {
            const options = stores.data.map(storeOptionFromAdminStore);
            setStoreOptions(options);
            setStoreId((current) => current || options[0]?.id || "");
          }
          return;
        }

        const stores = await listActiveOrganizations(token);
        if (!cancelled) {
          const options = stores.map((store) => ({
            id: store.id,
            name: store.name,
          }));
          setStoreOptions(options);
          setStoreId((current) => current || options[0]?.id || "");
        }
      } catch (caught) {
        if (!cancelled) {
          setError(messageFor(caught));
          setPlatformAccess({ isSuperadmin: false, permissions: [] });
        }
      }
    }

    void loadAccess();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !storeId || scope !== "store") {
      setStoreAccess(null);
      return;
    }

    const token = accessToken;
    const selectedStoreId = storeId;
    let cancelled = false;

    getEffectiveStorePermissions(token, selectedStoreId)
      .then((nextAccess) => {
        if (!cancelled) {
          setStoreAccess(nextAccess);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setStoreAccess(null);
          setError(messageFor(caught));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, scope, storeId]);

  useEffect(() => {
    if (canViewPlatformUsers && !storeId) {
      setScope("platform");
    }
  }, [canViewPlatformUsers, storeId]);

  const loadStaff = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (scope === "platform") {
        if (!canViewPlatformUsers) {
          setPlatformUsers([]);
          setPlatformRoles([]);
          return;
        }
        const [nextUsers, nextRoles] = await Promise.all([
          listPlatformUsers(accessToken),
          listPlatformRoles(accessToken),
        ]);
        setPlatformUsers(nextUsers.data);
        setPlatformRoles(nextRoles.data.filter((role) => role.isActive));
        return;
      }

      if (!storeId || !canViewSelectedStoreStaff) {
        setStoreUsers([]);
        setStoreRoles([]);
        return;
      }

      const nextUsers = await listStoreUsers(accessToken, storeId, {
        pageSize: 100,
      });
      setStoreUsers(nextUsers.data);

      if (canLoadSelectedStoreRoles) {
        const nextRoles = await listStoreRoles(accessToken, storeId, {
          pageSize: 100,
        });
        setStoreRoles(nextRoles.data.filter((role) => role.isActive));
      } else {
        setStoreRoles([]);
      }
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [
    accessToken,
    canLoadSelectedStoreRoles,
    canViewPlatformUsers,
    canViewSelectedStoreStaff,
    scope,
    storeId,
  ]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const visibleUsers = scope === "platform" ? platformUsers : storeUsers;
  const activeCount = visibleUsers.filter(
    (user) => user.status === "ACTIVE",
  ).length;
  const suspendedCount = visibleUsers.filter(
    (user) => user.status === "SUSPENDED",
  ).length;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="People"
        title="Staff"
        description="Platform staff and Store staff stay separated by SelfX RBAC scope."
        status={
          <Badge variant="secondary">
            {scope === "platform" ? "Platform" : selectedStoreName}
          </Badge>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void loadStaff()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            {scope === "platform" ? (
              <Button
                disabled={!canManagePlatformUsers}
                onClick={() => setPlatformDialogUser("new")}
              >
                <UserPlusIcon aria-hidden="true" />
                Add Platform User
              </Button>
            ) : (
              <Button
                disabled={!storeId || !canInviteSelectedStoreStaff}
                onClick={() => setStoreDialogUser("new")}
              >
                <UserPlusIcon aria-hidden="true" />
                Add Store Staff
              </Button>
            )}
          </div>
        }
      />

      <PageSection>
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[14rem_minmax(0,22rem)_1fr]">
          <label className="grid gap-2 text-sm font-medium">
            Scope
            <SelectMenu
              ariaLabel="Staff scope"
              value={scope}
              options={[
                {
                  value: "store",
                  label: "Store Staff",
                  disabled:
                    storeOptions.length === 0 && !canViewStoreStaffGlobally,
                },
                {
                  value: "platform",
                  label: "Platform Staff",
                  disabled: !canViewPlatformUsers,
                },
              ]}
              className="h-11"
              onChange={setScope}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Store
            <SelectMenu
              ariaLabel="Store"
              value={storeId}
              disabled={scope !== "store" || storeOptions.length === 0}
              options={[
                { value: "", label: "Select Store" },
                ...storeOptions.map((store) => ({
                  value: store.id,
                  label: store.name,
                })),
              ]}
              className="h-11"
              onChange={setStoreId}
            />
          </label>
          <div className="flex items-end text-sm text-muted-foreground">
            {scope === "platform"
              ? "SelfX Platform roles do not create merchant Store access."
              : "Store roles apply only inside the selected Store."}
          </div>
        </div>
      </PageSection>

      {error ? <AccessError message={error} /> : null}

      <PageSection>
        <StatGrid>
          <StatCard
            label="Total Staff"
            value={displayNumber(visibleUsers.length)}
            secondaryValue={
              scope === "platform" ? "Platform users" : "Store memberships"
            }
            icon={<UsersIcon size={18} aria-hidden="true" />}
          />
          <StatCard
            label="Active"
            value={displayNumber(activeCount)}
            secondaryValue="Ready for assigned access"
            icon={<UserCogIcon size={18} aria-hidden="true" />}
          />
          <StatCard
            label="Suspended"
            value={displayNumber(suspendedCount)}
            secondaryValue="Access currently disabled"
            icon={<ShieldAlertIcon size={18} aria-hidden="true" />}
          />
          <StatCard
            label="Roles"
            value={displayNumber(
              scope === "platform" ? platformRoles.length : storeRoles.length,
            )}
            secondaryValue={
              scope === "platform" ? "Platform role registry" : "Store roles"
            }
            icon={<StoreIcon size={18} aria-hidden="true" />}
          />
        </StatGrid>
      </PageSection>

      <PageSection>
        {scope === "platform" ? (
          <PlatformStaffTable
            loading={loading}
            users={platformUsers}
            canManage={canManagePlatformUsers}
            onEdit={setPlatformDialogUser}
          />
        ) : (
          <StoreStaffTable
            loading={loading}
            users={storeUsers}
            canAssignRoles={canAssignSelectedStoreRoles && storeRoles.length > 0}
            canUpdateStatus={canUpdateSelectedStoreStaff}
            onEdit={setStoreDialogUser}
            onStatus={(user, status) => void updateStoreStatus(user, status)}
          />
        )}
      </PageSection>

      <PlatformUserDialog
        user={platformDialogUser}
        roles={platformRoles}
        onOpenChange={(open) => {
          if (!open) {
            setPlatformDialogUser(null);
          }
        }}
        onSubmit={async (input) => {
          if (!accessToken) {
            return;
          }
          if (platformDialogUser === "new") {
            await addPlatformUser(accessToken, input);
          } else if (platformDialogUser) {
            await replacePlatformUserRoles(
              accessToken,
              platformDialogUser.id,
              input.roleIds,
            );
          }
          setPlatformDialogUser(null);
          await loadStaff();
        }}
      />

      <StoreUserDialog
        user={storeDialogUser}
        roles={storeRoles}
        canAssignRoles={canAssignSelectedStoreRoles && storeRoles.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setStoreDialogUser(null);
          }
        }}
        onSubmit={async (input) => {
          if (!accessToken || !storeId) {
            return;
          }
          if (storeDialogUser === "new") {
            await addStoreUser(accessToken, storeId, input);
          } else if (storeDialogUser) {
            await replaceStoreUserRoles(
              accessToken,
              storeId,
              storeDialogUser.membershipId,
              input.roleIds,
            );
          }
          setStoreDialogUser(null);
          await loadStaff();
        }}
      />
    </PageContainer>
  );

  async function updateStoreStatus(
    user: StoreUser,
    status: "ACTIVE" | "SUSPENDED",
  ) {
    if (!accessToken || !storeId) {
      return;
    }
    setError(null);
    try {
      const updated = await updateStoreUserStatus(
        accessToken,
        storeId,
        user.membershipId,
        status,
      );
      setStoreUsers((current) =>
        current.map((entry) =>
          entry.membershipId === updated.membershipId ? updated : entry,
        ),
      );
    } catch (caught) {
      setError(messageFor(caught));
    }
  }
}

function PlatformStaffTable({
  loading,
  users,
  canManage,
  onEdit,
}: {
  loading: boolean;
  users: PlatformUser[];
  canManage: boolean;
  onEdit: (user: PlatformUser) => void;
}) {
  return (
    <TableContainer
      title="Platform Staff"
      description="SelfX staff/admin access is global and separate from Store memberships."
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Platform Roles</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={4}>Loading Platform staff...</TableCell>
            </TableRow>
          ) : users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4}>No Platform staff found.</TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow key={user.id}>
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
                  {user.isProtectedSuperadmin
                    ? "Protected Superadmin"
                    : roleNames(user.platformRoles)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canManage || user.isProtectedSuperadmin}
                    onClick={() => onEdit(user)}
                  >
                    <PencilIcon aria-hidden="true" />
                    Roles
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function StoreStaffTable({
  loading,
  users,
  canAssignRoles,
  canUpdateStatus,
  onEdit,
  onStatus,
}: {
  loading: boolean;
  users: StoreUser[];
  canAssignRoles: boolean;
  canUpdateStatus: boolean;
  onEdit: (user: StoreUser) => void;
  onStatus: (user: StoreUser, status: "ACTIVE" | "SUSPENDED") => void;
}) {
  return (
    <TableContainer
      title="Store Staff"
      description="Store staff are listed only from the selected Store tenant."
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Store Roles</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5}>Loading Store staff...</TableCell>
            </TableRow>
          ) : users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>No Store staff found.</TableCell>
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
                <TableCell>{roleNames(user.roles)}</TableCell>
                <TableCell>{formatDate(user.joinedAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canAssignRoles}
                      onClick={() => onEdit(user)}
                    >
                      <PencilIcon aria-hidden="true" />
                      Roles
                    </Button>
                    {user.status === "SUSPENDED" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canUpdateStatus}
                        onClick={() => onStatus(user, "ACTIVE")}
                      >
                        Reactivate
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canUpdateStatus}
                        onClick={() => onStatus(user, "SUSPENDED")}
                      >
                        Suspend
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function PlatformUserDialog({
  user,
  roles,
  onOpenChange,
  onSubmit,
}: {
  user: PlatformUser | "new" | null;
  roles: PlatformRole[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { email: string; roleIds: string[] }) => Promise<void>;
}) {
  const open = user !== null;
  const [email, setEmail] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedRoles = useMemo(() => new Set(roleIds), [roleIds]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    if (user === "new") {
      setEmail("");
      setRoleIds([]);
    } else {
      setEmail(user.email);
      setRoleIds(user.platformRoles.map((role) => role.id));
    }
  }, [open, user]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ email: email.trim(), roleIds });
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
          <DialogTitle>
            {user === "new" ? "Add Platform User" : "Edit Platform Roles"}
          </DialogTitle>
          <DialogDescription>
            Platform roles grant SelfX-wide administration permissions.
          </DialogDescription>
        </DialogHeader>
        <RoleDialogBody
          email={email}
          emailDisabled={user !== "new"}
          roles={roles}
          selectedRoles={selectedRoles}
          roleSummary={(role) => `${role.permissionsCount} permissions`}
          error={error}
          onEmail={setEmail}
          onToggle={(roleId) => setRoleIds(toggleId(roleIds, roleId))}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving || !email.trim()} onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StoreUserDialog({
  user,
  roles,
  canAssignRoles,
  onOpenChange,
  onSubmit,
}: {
  user: StoreUser | "new" | null;
  roles: StoreRole[];
  canAssignRoles: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { email: string; roleIds: string[] }) => Promise<void>;
}) {
  const open = user !== null;
  const [email, setEmail] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedRoles = useMemo(() => new Set(roleIds), [roleIds]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    if (user === "new") {
      setEmail("");
      setRoleIds([]);
    } else {
      setEmail(user.email);
      setRoleIds(user.roles.map((role) => role.id));
    }
  }, [open, user]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ email: email.trim(), roleIds });
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
          <DialogTitle>
            {user === "new" ? "Add Store Staff" : "Edit Store Roles"}
          </DialogTitle>
          <DialogDescription>
            Store roles grant access only within this Store.
          </DialogDescription>
        </DialogHeader>
        <RoleDialogBody
          email={email}
          emailDisabled={user !== "new"}
          roles={canAssignRoles ? roles : []}
          selectedRoles={selectedRoles}
          roleSummary={(role) => role.description ?? "Store role"}
          error={error}
          emptyRoles="Role selection is unavailable; new users will receive the default Staff role when allowed."
          onEmail={setEmail}
          onToggle={(roleId) => setRoleIds(toggleId(roleIds, roleId))}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              saving || !email.trim() || (user !== "new" && !canAssignRoles)
            }
            onClick={() => void save()}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleDialogBody<Role extends { id: string; name: string }>({
  email,
  emailDisabled,
  roles,
  selectedRoles,
  roleSummary,
  error,
  emptyRoles = "No active roles are available.",
  onEmail,
  onToggle,
}: {
  email: string;
  emailDisabled: boolean;
  roles: Role[];
  selectedRoles: Set<string>;
  roleSummary: (role: Role) => string;
  error: string | null;
  emptyRoles?: string;
  onEmail: (value: string) => void;
  onToggle: (roleId: string) => void;
}) {
  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div className="grid gap-2 text-sm">
        <Label>Email</Label>
        <Input
          value={email}
          disabled={emailDisabled}
          placeholder="user@example.com"
          onChange={(event) => onEmail(event.target.value)}
        />
      </div>
      <div className="space-y-2 rounded-lg border p-3">
        {roles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyRoles}</p>
        ) : (
          roles.map((role) => (
            <label key={role.id} className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={selectedRoles.has(role.id)}
                onChange={() => onToggle(role.id)}
              />
              <span>
                <span className="font-medium">{role.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {roleSummary(role)}
                </span>
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

function AccessError({ message }: { message: string }) {
  return (
    <PageSection>
      <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <ShieldAlertIcon size={18} aria-hidden="true" />
        {message}
      </div>
    </PageSection>
  );
}

function storeOptionFromAdminStore(store: AdminStore): StoreOption {
  return { id: store.id, name: store.name };
}

function roleNames(roles: Array<{ name: string }>): string {
  return roles.length > 0 ? roles.map((role) => role.name).join(", ") : "-";
}

function toggleId(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}

function displayNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value,
  );
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "-";
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  if (caught instanceof Error) {
    return caught.message;
  }
  return "The staff request could not be completed.";
}
