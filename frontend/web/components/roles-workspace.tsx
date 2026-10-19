"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  PageContainer,
  PageHeader,
  PageSection,
  SelectMenu,
} from "@selfx/ui";
import { useSession } from "@/lib/session";
import {
  getRolesContext,
  getStoreRolesWorkspace,
  type RolesContext,
  type StoreRolesWorkspace,
} from "@/lib/roles";
import {
  replacePlatformRolePermissions,
  replaceStorePermissionGrants,
} from "@/lib/access-control";
import { replaceStoreRolePermissions } from "@/lib/stores";

type RoleView = {
  scope: "platform" | "store";
  id: string;
  name: string;
  description: string | null;
  systemCode: string | null;
  assignedUsersCount: number;
  permissions: { code: string }[];
  updatedAt: string;
  protected?: boolean;
  limit?: boolean;
};
const protectedRole: RoleView = {
  scope: "platform",
  id: "protected-superadmin",
  name: "Platform Superadmin",
  description:
    "Full platform access. Superadmin permissions are protected and cannot be changed here.",
  systemCode: "protected-superadmin",
  assignedUsersCount: 0,
  permissions: [],
  updatedAt: "",
  protected: true,
};

function selectionKey(role: RoleView): string {
  return `${role.scope}:${role.systemCode ?? role.id}`;
}

export function RolesWorkspace() {
  const session = useSession(),
    token = session.status === "authenticated" ? session.accessToken : null;
  const [context, setContext] = useState<RolesContext | null>(null),
    [store, setStore] = useState<StoreRolesWorkspace | null>(null);
  const [roleKey, setRoleKey] = useState("");
  const [selectedStore, setSelectedStore] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const storeId = selectedStore?.id ?? "";
  const [storeSearch, setStoreSearch] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true),
    [storeLoading, setStoreLoading] = useState(false),
    [saving, setSaving] = useState(false);
  const [error, setError] = useState(""),
    [storeError, setStoreError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const refresh = () => {
      setContext(null);
      setStore(null);
      setRoleKey("");
      setSelectedStore(null);
      setStoreSearch("");
      setPage(1);
      setRevision((value) => value + 1);
    };
    window.addEventListener("selfx:impersonation-changed", refresh);
    return () =>
      window.removeEventListener("selfx:impersonation-changed", refresh);
  }, []);
  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(
      () =>
        void getRolesContext(token, page, storeSearch)
          .then((value) => {
            if (!active) return;
            setContext(value);
            setSelectedStore(
              (current) => current ?? value.stores.data[0] ?? null,
            );
          })
          .catch((caught) => {
            if (active) {
              setContext(null);
              setStore(null);
              setError(message(caught));
            }
          })
          .finally(() => {
            if (active) setLoading(false);
          }),
      storeSearch ? 250 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [token, page, storeSearch, revision]);
  useEffect(() => {
    if (!token || !storeId) return;
    let active = true;
    setStore(null);
    setStoreLoading(true);
    setStoreError("");
    void getStoreRolesWorkspace(token, storeId)
      .then((value) => {
        if (active) setStore(value);
      })
      .catch((caught) => {
        if (active) setStoreError(message(caught));
      })
      .finally(() => {
        if (active) setStoreLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, storeId, revision]);
  const roles: RoleView[] = [
    ...(context?.canViewPlatform
      ? [
          { ...protectedRole, permissions: context.permissions },
          ...context.roles.map((role) => ({
            ...role,
            scope: "platform" as const,
          })),
        ]
      : []),
    ...(context && store
      ? store.roles.map((role) => ({
          ...role,
          scope: "store" as const,
          name: role.systemCode === "staff" ? "Store Staff" : role.name,
        }))
      : []),
  ];
  const selected: RoleView | null =
    roleKey === "store:store-limit" && store?.canEditCeiling
      ? {
          scope: "store",
          id: "store-limit",
          name: "Store permission limit",
          systemCode: "store-limit",
          description:
            "Superadmin controls which permissions this Store can use. Roles cannot grant access beyond this limit.",
          assignedUsersCount: 0,
          permissions: store.permissions.filter((p) => p.granted),
          updatedAt: store.ceilingUpdatedAt,
          limit: true,
        }
      : (roles.find((role) => selectionKey(role) === roleKey) ??
        (roleKey.startsWith("store:") && (storeLoading || storeError)
          ? null
          : (roles[0] ?? null)));
  const scope = selected?.scope ?? "platform";
  const permissions =
    scope === "platform"
      ? (context?.permissions ?? [])
      : (store?.permissions ?? []);
  const canEdit = !!(
    selected &&
    !selected.protected &&
    (scope === "platform"
      ? selected.systemCode === "platform-staff-admin"
        ? context?.canEditPlatformAdmin
        : context?.canEditPlatformStaff
      : selected.limit
        ? store?.canEditCeiling
        : selected.systemCode === "store-admin"
          ? store?.policy.canEditAdmin
          : store?.policy.canEditStaff)
  );
  const assignable =
    scope === "platform"
      ? (context?.assignablePlatformCodes ?? [])
      : selected?.limit
        ? (store?.permissions.map((p) => p.code) ?? [])
        : selected?.systemCode === "staff"
          ? (store?.policy.staffAssignableCodes ?? [])
          : (store?.policy.assignableCodes ?? []);
  const required =
    scope === "store" && selected?.systemCode === "store-admin"
      ? (store?.policy.requiredAdminCodes ?? [])
      : [];
  const notGranted = new Set(
    scope === "store" && !selected?.limit
      ? store?.permissions.filter((p) => !p.granted).map((p) => p.code)
      : [],
  );
  const busy = loading || (scope === "store" && storeLoading) || saving;
  const storeOptions = [
    ...(selectedStore &&
    !context?.stores.data.some((option) => option.id === selectedStore.id)
      ? [selectedStore]
      : []),
    ...(context?.stores.data ?? []),
  ];
  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="User Management"
        title="Roles"
        description="Review platform and Store roles. Permission changes apply to everyone assigned to the selected role in that scope."
        actions={
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setNotice("");
              setRevision((value) => value + 1);
            }}
          >
            Refresh roles
          </Button>
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {storeError && (
        <Alert variant="destructive">
          <AlertDescription>{storeError}</AlertDescription>
        </Alert>
      )}
      {notice && <p role="status">{notice}</p>}
      <PageSection>
        {context && (
          <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="role-store-search">Search Stores</Label>
              <Input
                id="role-store-search"
                value={storeSearch}
                disabled={saving}
                onChange={(event) => {
                  setStoreSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Store</Label>
              <SelectMenu
                ariaLabel="Store for roles"
                value={storeId}
                disabled={saving || loading}
                options={storeOptions.map((option) => ({
                  value: option.id,
                  label: option.name,
                }))}
                onChange={(value) => {
                  setSelectedStore(
                    storeOptions.find((option) => option.id === value) ?? null,
                  );
                  setStore(null);
                  setStoreLoading(true);
                  setStoreError("");
                  setNotice("");
                }}
              />
            </div>
            {selectedStore && (
              <p className="text-sm text-muted-foreground md:col-span-2">
                Store roles apply to{" "}
                <span className="font-medium text-foreground">
                  {selectedStore.name}
                </span>
                .
                {context.canViewPlatform &&
                  " Platform roles apply across SelfX."}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Button
                variant="outline"
                disabled={busy || page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous Stores
              </Button>
              <span>Page {page}</span>
              <Button
                variant="outline"
                disabled={busy || !context?.stores.hasMore}
                onClick={() => setPage((value) => value + 1)}
              >
                Next Stores
              </Button>
            </div>
          </div>
        )}
        {loading ? (
          <p>Loading role access…</p>
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  Role Registry
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {roles.map((role) => (
                  <Button
                    type="button"
                    variant="outline"
                    key={`${role.scope}:${role.id}`}
                    disabled={saving}
                    aria-pressed={
                      selected?.scope === role.scope && selected.id === role.id
                    }
                    aria-controls="role-permissions"
                    className={`h-auto w-full flex-col items-start gap-2 whitespace-normal border-2 p-3 text-left ${selected?.scope === role.scope && selected.id === role.id ? "border-primary! bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card"}`}
                    onClick={() => {
                      setRoleKey(selectionKey(role));
                      setNotice("");
                      setError("");
                    }}
                  >
                    <span className="font-medium">{role.name}</span>
                    <span className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {role.scope === "platform" ? "Platform" : "Store"}
                      </Badge>
                      {role.protected && (
                        <Badge variant="outline">Protected</Badge>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {role.permissions.length} permissions
                      {!role.protected &&
                        ` · ${role.assignedUsersCount} assigned users`}
                    </span>
                  </Button>
                ))}
                {storeLoading && <p>Loading Store roles…</p>}
                {!storeId && (
                  <p>No active Stores are available for this account.</p>
                )}
                {store?.canEditCeiling && (
                  <div className="border-t pt-3">
                    <p className="mb-2 text-xs text-muted-foreground">
                      Store access limit
                    </p>
                    <Button
                      variant="outline"
                      aria-pressed={selected?.limit === true}
                      aria-controls="role-permissions"
                      disabled={saving}
                      className={`h-auto whitespace-normal py-2 ${selected?.limit ? "border-2 border-primary! bg-primary/5" : ""}`}
                      onClick={() => {
                        setRoleKey("store:store-limit");
                        setNotice("");
                        setError("");
                      }}
                    >
                      Manage Store permission limit
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            {selected && (scope === "platform" || !storeLoading) && (
              <RolePermissionsEditor
                key={`${scope}:${scope === "store" ? storeId : ""}:${selected.id}:${selected.updatedAt}`}
                role={selected}
                permissions={permissions}
                canEdit={canEdit}
                assignable={assignable}
                required={required}
                notGranted={notGranted}
                busy={busy}
                storeScope={scope === "store"}
                onSave={async (codes) => {
                  if (!token || !canEdit || saving) return;
                  setSaving(true);
                  setError("");
                  setNotice("");
                  try {
                    if (scope === "platform")
                      await replacePlatformRolePermissions(
                        token,
                        selected.id,
                        codes,
                        selected.updatedAt,
                      );
                    else if (selected.limit)
                      await replaceStorePermissionGrants(
                        token,
                        storeId,
                        codes,
                        selected.updatedAt,
                      );
                    else
                      await replaceStoreRolePermissions(
                        token,
                        storeId,
                        selected.id,
                        codes,
                        selected.updatedAt,
                      );
                    setNotice(
                      selected.limit
                        ? "Store permission limit saved. Effective access now follows this limit."
                        : `${selected.name} permissions saved for ${selected.assignedUsersCount} assigned users.`,
                    );
                    setRevision((value) => value + 1);
                    window.dispatchEvent(
                      new Event("selfx:permissions-changed"),
                    );
                  } catch (caught) {
                    setError(message(caught));
                    throw caught;
                  } finally {
                    setSaving(false);
                  }
                }}
              />
            )}
          </div>
        )}
      </PageSection>
    </PageContainer>
  );
}

function RolePermissionsEditor({
  role,
  permissions,
  canEdit,
  assignable,
  required,
  notGranted,
  busy,
  onSave,
  storeScope,
}: {
  role: RoleView;
  permissions: {
    code: string;
    label: string;
    description: string | null;
    module: string;
  }[];
  canEdit: boolean;
  assignable: string[];
  required: string[];
  notGranted: Set<string>;
  busy: boolean;
  onSave: (codes: string[]) => Promise<void>;
  storeScope: boolean;
}) {
  const [codes, setCodes] = useState([
      ...new Set([
        ...role.permissions.map((p) => p.code),
        ...(canEdit ? required : []),
      ]),
    ]),
    [search, setSearch] = useState(""),
    [saving, setSaving] = useState(false);
  const editable = (code: string) =>
    canEdit &&
    !required.includes(code) &&
    (assignable.includes(code) || (storeScope && codes.includes(code)));
  const groups = useMemo(() => {
    const result = new Map<string, typeof permissions>();
    for (const permission of permissions.filter((p) =>
      `${p.label} ${p.code} ${p.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ))
      result.set(permission.module, [
        ...(result.get(permission.module) ?? []),
        permission,
      ]);
    return [...result];
  }, [permissions, search]);
  const initial = role.permissions.map((p) => p.code);
  const dirty =
    codes.length !== initial.length ||
    codes.some((code) => !initial.includes(code));
  function toggle(code: string) {
    if (!editable(code) || busy) return;
    setCodes((current) =>
      current.includes(code)
        ? current.filter((value) => value !== code)
        : [...current, code],
    );
  }
  return (
    <Card id="role-permissions" aria-labelledby="role-permissions-title">
      <CardHeader>
        <CardTitle id="role-permissions-title" role="heading" aria-level={2}>
          {role.name} permissions
        </CardTitle>
        <p className="text-sm text-muted-foreground">{role.description}</p>
        {!role.protected && !role.limit && (
          <p className="text-sm">
            Changes affect {role.assignedUsersCount} assigned users in this
            scope.
          </p>
        )}
        {!canEdit && (
          <p className="text-sm">
            {role.protected
              ? "Superadmin authority is protected and cannot be edited here."
              : "Read-only: this role requires a higher level of role management authority."}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          aria-label="Search permissions"
          placeholder="Search permissions"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{codes.length} permissions selected</Badge>
          {canEdit && (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setCodes((current) => [
                    ...new Set([...current, ...assignable]),
                  ])
                }
              >
                Select all
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setCodes((current) =>
                    current.filter(
                      (code) => required.includes(code) || !editable(code),
                    ),
                  )
                }
              >
                Clear
              </Button>
            </>
          )}
        </div>
        {groups.length === 0 && <p>No permissions match this search.</p>}
        {groups.map(([module, entries]) => (
          <section key={module} className="space-y-3 rounded-lg border p-4">
            <h3 className="font-medium">{module}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {entries.map((permission) => (
                <div
                  key={permission.code}
                  className="flex gap-3 rounded-lg border p-3 text-sm"
                >
                  <Checkbox
                    id={`permission-${role.id}-${permission.code}`}
                    checked={codes.includes(permission.code)}
                    disabled={busy || !editable(permission.code)}
                    onCheckedChange={() => toggle(permission.code)}
                    aria-labelledby={`permission-label-${role.id}-${permission.code}`}
                    aria-describedby={`permission-description-${role.id}-${permission.code}`}
                  />
                  <span className="min-w-0">
                    <Label
                      id={`permission-label-${role.id}-${permission.code}`}
                      htmlFor={`permission-${role.id}-${permission.code}`}
                      className="block font-medium leading-normal"
                    >
                      {permission.label}
                    </Label>
                    <span
                      id={`permission-description-${role.id}-${permission.code}`}
                      className="block text-xs text-muted-foreground"
                    >
                      {permission.description}
                    </span>
                    {required.includes(permission.code) ? (
                      <span className="block text-xs">
                        Required for Store administration
                      </span>
                    ) : notGranted.has(permission.code) ? (
                      <span className="block text-xs">
                        Not enabled for this Store
                      </span>
                    ) : !assignable.includes(permission.code) && canEdit ? (
                      <span className="block text-xs">
                        Cannot grant with this role or your current authority
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
        {canEdit && (
          <div className="flex justify-end">
            <Button
              disabled={busy || saving || !dirty}
              onClick={async () => {
                setSaving(true);
                try {
                  await onSave(codes);
                } catch {
                  /* parent displays API error */
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving…" : "Save permissions"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
function message(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : "Role management could not be loaded or saved.";
}
