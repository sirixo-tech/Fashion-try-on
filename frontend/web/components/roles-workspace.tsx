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
} from "@selfx/ui";
import { useSession } from "@/lib/session";
import {
  getRolesContext,
  replaceGlobalStoreRolePermissions,
  type RolesContext,
} from "@/lib/roles";
import { replacePlatformRolePermissions } from "@/lib/access-control";

type RoleView = {
  scope: "platform" | "store";
  id: string;
  name: string;
  description: string | null;
  systemCode: string | null;
  assignedUsersCount: number | null;
  permissions: { code: string }[];
  updatedAt: string;
  protected?: boolean;
};
const protectedRole: RoleView = {
  scope: "platform",
  id: "protected-superadmin",
  name: "Platform Superadmin",
  description:
    "Full platform access. Superadmin permissions are protected and cannot be changed here.",
  systemCode: "protected-superadmin",
  assignedUsersCount: null,
  permissions: [],
  updatedAt: "",
  protected: true,
};
const selectionKey = (role: RoleView) =>
  `${role.scope}:${role.systemCode ?? role.id}`;

export function RolesWorkspace() {
  const session = useSession();
  const token = session.status === "authenticated" ? session.accessToken : null;
  const [context, setContext] = useState<RolesContext | null>(null);
  const [roleKey, setRoleKey] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const refresh = () => {
      setContext(null);
      setRoleKey("");
      setNotice("");
      setRevision((v) => v + 1);
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
    void getRolesContext(token)
      .then((value) => {
        if (active) setContext(value);
      })
      .catch((caught) => {
        if (active) {
          setContext(null);
          setError(message(caught));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, revision]);
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
    ...(context?.storeRoles.roles.map((role) => ({
      ...role,
      scope: "store" as const,
    })) ?? []),
  ];
  const selected =
    roles.find((role) => selectionKey(role) === roleKey) ?? roles[0] ?? null;
  const storeScope = selected?.scope === "store";
  const canEdit = !!(
    selected &&
    !selected.protected &&
    (storeScope
      ? context?.storeRoles.canEdit
      : selected.systemCode === "platform-staff-admin"
        ? context?.canEditPlatformAdmin
        : context?.canEditPlatformStaff)
  );
  const permissions = storeScope
    ? (context?.storeRoles.permissions ?? [])
    : (context?.permissions ?? []);
  const assignable = storeScope
    ? permissions.map((p) => p.code)
    : (context?.assignablePlatformCodes ?? []);
  const required =
    storeScope && selected?.systemCode === "store-admin"
      ? (context?.storeRoles.requiredAdminCodes ?? [])
      : [];
  const busy = loading || saving;
  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="User Management"
        title="Roles"
        description="Define application-wide role permissions. Store role changes apply to everyone assigned that role across all Stores."
        actions={
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setNotice("");
              setRevision((v) => v + 1);
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
      {notice && <p role="status">{notice}</p>}
      <PageSection>
        {loading ? (
          <p>Loading role access…</p>
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  Role Registry
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {context?.canViewPlatform
                    ? "Shared role definitions and assigned users."
                    : "Shared role definitions."}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {roles.map((role) => (
                  <Button
                    type="button"
                    variant="outline"
                    key={selectionKey(role)}
                    disabled={saving}
                    aria-pressed={
                      !!selected &&
                      selectionKey(selected) === selectionKey(role)
                    }
                    aria-controls="role-permissions"
                    className={`h-auto w-full flex-col items-start gap-2 whitespace-normal border-2 p-3 text-left ${selected && selectionKey(selected) === selectionKey(role) ? "border-primary! bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card"}`}
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
                      {role.assignedUsersCount !== null &&
                        ` · ${role.assignedUsersCount} assigned users`}
                    </span>
                  </Button>
                ))}
              </CardContent>
            </Card>
            {selected && (
              <RolePermissionsEditor
                key={`${selectionKey(selected)}:${selected.updatedAt}`}
                role={selected}
                permissions={permissions}
                canEdit={canEdit}
                assignable={assignable}
                required={required}
                busy={busy}
                storeScope={storeScope}
                onSave={async (codes) => {
                  if (!token || !canEdit || saving) return;
                  setSaving(true);
                  setError("");
                  setNotice("");
                  try {
                    if (storeScope)
                      await replaceGlobalStoreRolePermissions(
                        token,
                        selected.systemCode!,
                        codes,
                        selected.updatedAt,
                      );
                    else
                      await replacePlatformRolePermissions(
                        token,
                        selected.id,
                        codes,
                        selected.updatedAt,
                      );
                    setNotice(
                      `${selected.name} permissions saved${storeScope ? " across all Stores" : " for all assigned users"}.`,
                    );
                    setRevision((v) => v + 1);
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
    action: string;
  }[];
  canEdit: boolean;
  assignable: string[];
  required: string[];
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
  const sensitiveCodes = new Set([
    "ORGANIZATION_APPLICATION_APPROVE",
    "ORGANIZATION_APPLICATION_REJECT",
    "ORGANIZATION_ACTIVATE",
    "ORGANIZATION_SUSPEND",
    "STORES_DEACTIVATE",
    "PERMISSIONS_MANAGE",
    "PLATFORM_ROLES_MANAGE",
    "PLATFORM_USERS_MANAGE",
    "STORE_ROLES_MANAGE",
    "STORE_IMPERSONATION",
    "users.deactivate",
    "roles.delete",
    "kiosks.revoke",
    "tryon.garment_preview",
  ]);
  const permissionGroups = useMemo(() => {
    const result = new Map<string, typeof permissions>();
    for (const permission of permissions) {
      if (sensitiveCodes.has(permission.code)) continue;
      const group =
        permission.code === "products.manage"
          ? "Products & stock"
          : permission.module;
      result.set(group, [...(result.get(group) ?? []), permission]);
    }
    const query = search.trim().toLowerCase();
    return [...result]
      .map(([name, entries]) => {
        const view = entries.filter(
          (entry) =>
            entry.action === "view" ||
            entry.code === "ORGANIZATION_APPLICATION_REVIEW" ||
            entry.code === "PERMISSIONS_VIEW",
        );
        const manage = entries.filter((entry) => !view.includes(entry));
        return { name, entries, view, manage };
      })
      .filter(
        ({ name, entries }) =>
          !query ||
          `${name} ${entries.map((entry) => `${entry.label} ${entry.code} ${entry.description}`).join(" ")}`
            .toLowerCase()
            .includes(query),
      );
  }, [permissions, search]);
  const sensitivePermissions = permissions.filter(
    (permission) =>
      sensitiveCodes.has(permission.code) &&
      `${permission.label} ${permission.code} ${permission.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
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
  function setGroup(
    group: (typeof permissionGroups)[number],
    mode: "view" | "manage",
    enabled: boolean,
  ) {
    const target = mode === "view" ? group.view : group.manage;
    const changes = target.filter((permission) => editable(permission.code));
    const viewCodes = group.view.map((permission) => permission.code);
    setCodes((current) => {
      let next = new Set(current);
      if (mode === "view" && !enabled) {
        for (const permission of [...group.view, ...group.manage])
          if (editable(permission.code)) next.delete(permission.code);
      } else if (mode === "view") {
        for (const permission of changes) next.add(permission.code);
      } else if (enabled) {
        for (const permission of changes) next.add(permission.code);
        for (const code of viewCodes) if (editable(code)) next.add(code);
      } else {
        for (const permission of changes) next.delete(permission.code);
      }
      return [...next];
    });
  }
  return (
    <Card
      id="role-permissions"
      appearance="plain"
      aria-labelledby="role-permissions-title"
    >
      <CardHeader>
        <CardTitle id="role-permissions-title" role="heading" aria-level={2}>
          {role.name} permissions
        </CardTitle>
        <p className="text-sm text-muted-foreground">{role.description}</p>
        {!role.protected && (
          <p className="text-sm">
            {storeScope
              ? "Changes apply to this role across all Stores. Each user remains limited to their Store memberships and plan entitlements."
              : "Changes apply to all users assigned this Platform role."}
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
                    ...new Set([
                      ...current,
                      ...permissionGroups.flatMap((group) =>
                        [...group.view, ...group.manage]
                          .filter((permission) => editable(permission.code))
                          .map((permission) => permission.code),
                      ),
                    ]),
                  ])
                }
              >
                Select routine access
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
        {permissionGroups.length === 0 && sensitivePermissions.length === 0 && (
          <p>No permissions match this search.</p>
        )}
        {permissionGroups.map((group) => (
          <section key={group.name} className="space-y-3 rounded-lg border p-4">
            <h3 className="font-medium">{group.name}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {group.view.length > 0 && (
                <div className="flex gap-3 rounded-lg border p-3 text-sm">
                  <Checkbox
                    id={`permission-${role.id}-${group.name}-view`}
                    checked={group.view.some((permission) =>
                      codes.includes(permission.code),
                    )}
                    disabled={
                      busy ||
                      !group.view.some((permission) =>
                        editable(permission.code),
                      )
                    }
                    onCheckedChange={(checked) =>
                      setGroup(group, "view", checked === true)
                    }
                  />
                  <span className="min-w-0">
                    <Label
                      htmlFor={`permission-${role.id}-${group.name}-view`}
                      className="block font-medium leading-normal"
                    >
                      View
                    </Label>
                    <span className="block text-xs text-muted-foreground">
                      View this section and its records.
                    </span>
                  </span>
                </div>
              )}
              {group.manage.length > 0 && (
                <div className="flex gap-3 rounded-lg border p-3 text-sm">
                  <Checkbox
                    id={`permission-${role.id}-${group.name}-manage`}
                    checked={group.manage.every((permission) =>
                      codes.includes(permission.code),
                    )}
                    disabled={
                      busy ||
                      !group.manage.some((permission) =>
                        editable(permission.code),
                      )
                    }
                    onCheckedChange={(checked) =>
                      setGroup(group, "manage", checked === true)
                    }
                  />
                  <span className="min-w-0">
                    <Label
                      htmlFor={`permission-${role.id}-${group.name}-manage`}
                      className="block font-medium leading-normal"
                    >
                      Manage
                    </Label>
                    <span className="block text-xs text-muted-foreground">
                      View this section and manage its available actions.
                    </span>
                  </span>
                </div>
              )}
            </div>
            {group.entries.some((permission) =>
              required.includes(permission.code),
            ) && (
              <p className="text-xs text-muted-foreground">
                Required permissions for Store administration remain selected.
              </p>
            )}
          </section>
        ))}
        {sensitivePermissions.length > 0 && (
          <section className="space-y-3 rounded-lg border border-destructive/30 p-4">
            <h3 className="font-medium">Sensitive actions and capabilities</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {sensitivePermissions.map((permission) => (
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
        )}
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
