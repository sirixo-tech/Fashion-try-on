"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  PageContainer,
  PageHeader,
  PageSection,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@selfx/ui";

import {
  createPlatformRole,
  listAccessPermissions,
  listPlatformRoles,
  replacePlatformRolePermissions,
  updatePlatformRole,
  type AccessPermission,
  type PlatformRole,
} from "@/lib/access-control";
import { SafeApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function PlatformRolesPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [permissions, setPermissions] = useState<AccessPermission[]>([]);
  const [dialogRole, setDialogRole] = useState<PlatformRole | "new" | null>(
    null,
  );
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
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

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
            <Button onClick={() => setDialogRole("new")}>
              <PlusIcon aria-hidden="true" />
              Add Role
            </Button>
          </div>
        }
      />
      {error ? <AccessError message={error} /> : null}
      <PageSection>
        <TableContainer title="Platform Roles">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5}>Loading Platform roles...</TableCell>
                </TableRow>
              ) : roles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>No Platform roles found.</TableCell>
                </TableRow>
              ) : (
                roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <div className="font-medium">{role.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {role.systemCode ?? "custom"}
                      </div>
                    </TableCell>
                    <TableCell>{role.permissionsCount}</TableCell>
                    <TableCell>{role.assignedUsersCount}</TableCell>
                    <TableCell>
                      {role.isActive ? "Active" : "Inactive"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDialogRole(role)}
                      >
                        <PencilIcon aria-hidden="true" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </PageSection>
      <PlatformRoleDialog
        role={dialogRole}
        permissions={permissions}
        onOpenChange={(open) => {
          if (!open) {
            setDialogRole(null);
          }
        }}
        onSubmit={async (input) => {
          if (!accessToken) {
            return;
          }
          if (dialogRole === "new") {
            await createPlatformRole(accessToken, {
              name: input.name,
              description: input.description ?? undefined,
              permissionCodes: input.permissionCodes,
            });
          } else if (dialogRole) {
            await updatePlatformRole(accessToken, dialogRole.id, {
              name: input.name,
              description: input.description,
              isActive: input.isActive,
            });
            await replacePlatformRolePermissions(
              accessToken,
              dialogRole.id,
              input.permissionCodes,
            );
          }
          setDialogRole(null);
          await load();
        }}
      />
    </PageContainer>
  );
}

function PlatformRoleDialog({
  role,
  permissions,
  onOpenChange,
  onSubmit,
}: {
  role: PlatformRole | "new" | null;
  permissions: AccessPermission[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    name: string;
    description?: string | null;
    isActive: boolean;
    permissionCodes: string[];
  }) => Promise<void>;
}) {
  const open = role !== null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [permissionCodes, setPermissionCodes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const rolePermissions = useMemo(
    () => new Set(permissionCodes),
    [permissionCodes],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    if (role === "new") {
      setName("");
      setDescription("");
      setIsActive(true);
      setPermissionCodes([]);
    } else {
      setName(role.name);
      setDescription(role.description ?? "");
      setIsActive(role.isActive);
      setPermissionCodes(role.permissions.map((permission) => permission.code));
    }
  }, [open, role]);

  function toggle(code: string) {
    setPermissionCodes((current) =>
      current.includes(code)
        ? current.filter((entry) => entry !== code)
        : [...current, code],
    );
  }

  async function save() {
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        isActive,
        permissionCodes,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {role === "new" ? "Create Platform Role" : "Edit Platform Role"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            value={name}
            placeholder="Role name"
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            value={description}
            placeholder="Description"
            onChange={(event) => setDescription(event.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            Active
          </label>
          <div className="max-h-72 space-y-2 overflow-auto rounded-md border p-3">
            {permissions.map((permission) => (
              <label
                key={permission.code}
                className="flex items-start gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={rolePermissions.has(permission.code)}
                  onChange={() => toggle(permission.code)}
                />
                <span>
                  <span className="font-medium">{permission.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {permission.code}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving || !name.trim()} onClick={() => void save()}>
            <ShieldCheckIcon aria-hidden="true" />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
