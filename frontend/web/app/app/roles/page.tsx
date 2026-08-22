"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  PageContainer,
  PageHeader,
  PageSection,
  cn,
} from "@selfx/ui";

import {
  createPlatformRole,
  listAccessPermissions,
  listPlatformRoles,
  replacePlatformRolePermissions,
  type AccessPermission,
  type PlatformRole,
} from "@/lib/access-control";
import { SafeApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

const NEW_ROLE_KEY = "__new_role__";

export default function PlatformRolesPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [permissions, setPermissions] = useState<AccessPermission[]>([]);
  const [selectedRoleKey, setSelectedRoleKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextRoles, nextPermissions] = await Promise.all([
        listPlatformRoles(accessToken),
        listAccessPermissions(accessToken),
      ]);
      setRoles(nextRoles.data);
      setPermissions(
        nextPermissions.data.filter(
          (permission) => permission.applicability !== "STORE",
        ),
      );
      setSelectedRoleKey((current) => {
        if (
          current === NEW_ROLE_KEY ||
          nextRoles.data.some((role) => role.id === current)
        ) {
          return current;
        }
        return nextRoles.data[0]?.id ?? null;
      });
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleKey) ?? null,
    [roles, selectedRoleKey],
  );

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Access Control"
        title="Platform Roles"
        description="Global SelfX roles for platform users. Superadmin bootstrap authority is protected outside normal role assignment."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            <Button onClick={() => setSelectedRoleKey(NEW_ROLE_KEY)}>
              <PlusIcon aria-hidden="true" />
              Add Role
            </Button>
          </div>
        }
      />
      {error ? <AccessError message={error} /> : null}
      <PageSection>
        <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <Card className="xl:sticky xl:top-6 xl:self-start">
            <CardHeader>
              <CardTitle>Role Registry</CardTitle>
              <CardDescription>
                {loading
                  ? "Loading roles..."
                  : `${roles.length} role${roles.length === 1 ? "" : "s"} available.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Loading Platform roles...
                </div>
              ) : roles.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No Platform roles found.
                </div>
              ) : (
                roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    aria-pressed={selectedRoleKey === role.id}
                    className={cn(
                      "relative flex w-full flex-col gap-2 overflow-hidden rounded-lg border p-3 text-left transition-colors hover:border-primary/70 hover:bg-primary/5",
                      selectedRoleKey === role.id
                        ? "border-primary bg-[color-mix(in_srgb,var(--selfx-primary),white_90%)] shadow-sm ring-2 ring-primary/25"
                        : "border-border bg-background",
                    )}
                    onClick={() => setSelectedRoleKey(role.id)}
                  >
                    {selectedRoleKey === role.id ? (
                      <span className="absolute inset-y-0 left-0 w-1 bg-primary" />
                    ) : null}
                    <span className="flex min-w-0 items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">
                          {role.name}
                        </span>
                      </span>
                      <Badge
                        variant={role.isActive ? "secondary" : "outline"}
                        className="shrink-0"
                      >
                        {role.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {role.permissionsCount} permission
                      {role.permissionsCount === 1 ? "" : "s"} |{" "}
                      {role.assignedUsersCount} assigned user
                      {role.assignedUsersCount === 1 ? "" : "s"}
                    </span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
          <PlatformRoleEditor
            roleKey={selectedRoleKey}
            role={selectedRole}
            permissions={permissions}
            loading={loading}
            onCreateNew={() => setSelectedRoleKey(NEW_ROLE_KEY)}
            onSubmit={async (input) => {
              if (!accessToken) {
                return;
              }
              if (selectedRoleKey === NEW_ROLE_KEY) {
                const created = await createPlatformRole(accessToken, {
                  name: input.name,
                  description: input.description ?? undefined,
                  permissionCodes: input.permissionCodes,
                });
                setSelectedRoleKey(created.id);
              } else if (selectedRole) {
                await replacePlatformRolePermissions(
                  accessToken,
                  selectedRole.id,
                  input.permissionCodes,
                );
                setSelectedRoleKey(selectedRole.id);
              }
              await load();
            }}
          />
        </div>
      </PageSection>
    </PageContainer>
  );
}

function PlatformRoleEditor({
  roleKey,
  role,
  permissions,
  loading,
  onCreateNew,
  onSubmit,
}: {
  roleKey: string | null;
  role: PlatformRole | null;
  permissions: AccessPermission[];
  loading: boolean;
  onCreateNew: () => void;
  onSubmit: (input: {
    name: string;
    description?: string | null;
    isActive: boolean;
    permissionCodes: string[];
  }) => Promise<void>;
}) {
  const isNew = roleKey === NEW_ROLE_KEY;
  const hasSelection = isNew || role !== null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissionCodes, setPermissionCodes] = useState<string[]>([]);
  const [permissionSearch, setPermissionSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setSaveError(null);
    setPermissionSearch("");
    if (isNew) {
      setName("");
      setDescription("");
      setPermissionCodes([]);
      return;
    }
    if (role) {
      setName(role.name);
      setDescription(role.description ?? "");
      setPermissionCodes(role.permissions.map((permission) => permission.code));
    }
  }, [isNew, role]);

  const allPermissionCodes = useMemo(
    () => permissions.map((permission) => permission.code),
    [permissions],
  );
  const selectedPermissions = useMemo(
    () => new Set(permissionCodes),
    [permissionCodes],
  );
  const permissionGroups = useMemo(
    () => groupPermissions(permissions, permissionSearch),
    [permissionSearch, permissions],
  );

  function togglePermission(code: string) {
    setPermissionCodes((current) =>
      current.includes(code)
        ? current.filter((entry) => entry !== code)
        : [...current, code],
    );
  }

  function setModulePermissions(modulePermissions: AccessPermission[]) {
    const moduleCodes = modulePermissions.map((permission) => permission.code);
    const hasEveryModulePermission = moduleCodes.every((code) =>
      selectedPermissions.has(code),
    );

    setPermissionCodes((current) => {
      if (hasEveryModulePermission) {
        return current.filter((code) => !moduleCodes.includes(code));
      }
      return [...new Set([...current, ...moduleCodes])];
    });
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        isActive: role?.isActive ?? true,
        permissionCodes,
      });
    } catch (caught) {
      setSaveError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  if (!hasSelection) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-center">
            <ShieldCheckIcon
              aria-hidden="true"
              className="size-8 text-muted-foreground"
            />
            <div>
              <p className="font-medium text-foreground">Select a role</p>
              <p className="text-sm text-muted-foreground">
                Choose an existing role or create a new one.
              </p>
            </div>
            <Button onClick={onCreateNew}>
              <PlusIcon aria-hidden="true" />
              Add Role
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5">
        {isNew ? (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">
                New Platform Role
              </h2>
              <p className="text-sm text-muted-foreground">
                Create a role and assign permissions in one workspace.
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <label className="space-y-1.5 text-sm font-medium">
                Role name
                <Input
                  value={name}
                  placeholder="Role name"
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                Description
                <Input
                  value={description}
                  placeholder="Description"
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
            </div>
          </>
        ) : null}

        <div
          className={cn(
            "flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-center",
            isNew ? "border-t pt-4" : "",
          )}
        >
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={permissionSearch}
              placeholder="Search permissions..."
              className="pl-8"
              onChange={(event) => setPermissionSearch(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPermissionCodes(allPermissionCodes)}
            >
              Select all permissions
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPermissionCodes([])}
            >
              Clear all permissions
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {permissionCodes.length} of {permissions.length} permissions
              selected
            </span>
            {permissionSearch.trim() ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPermissionSearch("")}
              >
                Clear search
              </Button>
            ) : null}
          </div>
          {loading ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Loading permissions...
            </div>
          ) : permissionGroups.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No permissions match the current search.
            </div>
          ) : (
            permissionGroups.map((group) => {
              const selectedCount = group.permissions.filter((permission) =>
                selectedPermissions.has(permission.code),
              ).length;
              const allSelected = selectedCount === group.permissions.length;

              return (
                <section
                  key={group.module}
                  className="rounded-lg border bg-background p-4"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-medium text-foreground">
                        {group.module}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {selectedCount} of {group.permissions.length} selected
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setModulePermissions(group.permissions)}
                    >
                      {allSelected ? "Clear module" : "Select module"}
                    </Button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {group.permissions.map((permission) => (
                      <label
                        key={permission.code}
                        className="flex min-h-16 items-start gap-3 rounded-lg border bg-card p-3 text-sm"
                      >
                        <PermissionCheckbox
                          checked={selectedPermissions.has(permission.code)}
                          onChange={() => togglePermission(permission.code)}
                        />
                        <span className="min-w-0">
                          <span className="block font-medium text-foreground">
                            {permission.label}
                          </span>
                          <span className="block break-words text-xs text-muted-foreground">
                            {permission.code}
                          </span>
                          {permission.description ? (
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {permission.description}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>

        {saveError ? (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <ShieldAlertIcon size={18} aria-hidden="true" />
            {saveError}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button
            disabled={saving || (isNew && !name.trim())}
            onClick={() => void save()}
          >
            <ShieldCheckIcon aria-hidden="true" />
            {saving ? "Saving..." : "Save Role"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function groupPermissions(
  permissions: AccessPermission[],
  search: string,
): { module: string; permissions: AccessPermission[] }[] {
  const query = search.trim().toLowerCase();
  const matchingPermissions = permissions.filter((permission) => {
    if (!query) {
      return true;
    }
    return [
      permission.label,
      permission.code,
      permission.module,
      permission.action,
      permission.description ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
  const groups = new Map<string, AccessPermission[]>();

  for (const permission of matchingPermissions) {
    groups.set(permission.module, [
      ...(groups.get(permission.module) ?? []),
      permission,
    ]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([module, modulePermissions]) => ({
      module,
      permissions: modulePermissions.sort((left, right) =>
        left.label.localeCompare(right.label),
      ),
    }));
}

function PermissionCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <span className="relative mt-0.5 inline-flex size-5 shrink-0">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={onChange}
      />
      <span className="flex size-5 items-center justify-center rounded border border-input bg-white text-primary transition-colors peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">
        <CheckIcon
          aria-hidden="true"
          className={cn(
            "size-4 stroke-[3] transition-opacity",
            checked ? "opacity-100" : "opacity-0",
          )}
        />
      </span>
    </span>
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

function messageFor(error: unknown): string {
  if (error instanceof SafeApiError) {
    return error.message;
  }
  return "The request could not be completed.";
}
