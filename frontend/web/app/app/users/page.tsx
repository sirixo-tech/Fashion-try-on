"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PencilIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  UserPlusIcon,
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
  listPlatformRoles,
  listPlatformUsers,
  replacePlatformUserRoles,
  type PlatformRole,
  type PlatformUser,
} from "@/lib/access-control";
import { SafeApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function PlatformUsersPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [dialogUser, setDialogUser] = useState<PlatformUser | "new" | null>(
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
      const [nextUsers, nextRoles] = await Promise.all([
        listPlatformUsers(accessToken),
        listPlatformRoles(accessToken),
      ]);
      setUsers(nextUsers.data);
      setRoles(nextRoles.data.filter((role) => role.isActive));
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
        title="Platform Users"
        description="Global SelfX Platform user role assignment. Protected Superadmins cannot be changed here."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            <Button onClick={() => setDialogUser("new")}>
              <UserPlusIcon aria-hidden="true" />
              Add User
            </Button>
          </div>
        }
      />
      {error ? <AccessError message={error} /> : null}
      <PageSection>
        <TableContainer title="Platform Users">
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
                  <TableCell colSpan={4}>Loading Platform users...</TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>No users found.</TableCell>
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
                        : user.platformRoles.length > 0
                          ? user.platformRoles
                              .map((role) => role.name)
                              .join(", ")
                          : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={user.isProtectedSuperadmin}
                        onClick={() => setDialogUser(user)}
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
      </PageSection>
      <PlatformUserDialog
        user={dialogUser}
        roles={roles}
        onOpenChange={(open) => {
          if (!open) {
            setDialogUser(null);
          }
        }}
        onSubmit={async (input) => {
          if (!accessToken) {
            return;
          }
          if (dialogUser === "new") {
            await addPlatformUser(accessToken, input);
          } else if (dialogUser) {
            await replacePlatformUserRoles(
              accessToken,
              dialogUser.id,
              input.roleIds,
            );
          }
          setDialogUser(null);
          await load();
        }}
      />
    </PageContainer>
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
  const selectedRoles = useMemo(() => new Set(roleIds), [roleIds]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (user === "new") {
      setEmail("");
      setRoleIds([]);
    } else {
      setEmail(user.email);
      setRoleIds(user.platformRoles.map((role) => role.id));
    }
  }, [open, user]);

  function toggle(roleId: string) {
    setRoleIds((current) =>
      current.includes(roleId)
        ? current.filter((entry) => entry !== roleId)
        : [...current, roleId],
    );
  }

  async function save() {
    setSaving(true);
    try {
      await onSubmit({ email: email.trim(), roleIds });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {user === "new" ? "Add Platform User" : "Edit Platform User Roles"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            value={email}
            disabled={user !== "new"}
            placeholder="user@example.com"
            onChange={(event) => setEmail(event.target.value)}
          />
          <div className="space-y-2 rounded-md border p-3">
            {roles.map((role) => (
              <label key={role.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedRoles.has(role.id)}
                  onChange={() => toggle(role.id)}
                />
                <span>
                  <span className="font-medium">{role.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {role.permissionsCount} permissions
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
          <Button
            disabled={saving || !email.trim()}
            onClick={() => void save()}
          >
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
