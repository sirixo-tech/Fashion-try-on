"use client";

import { useEffect, useState } from "react";
import { PencilIcon, RefreshCwIcon } from "lucide-react";
import {
  Alert,
  AlertDescription,
  Button,
  FilterBar,
  Input,
  Label,
  PageContainer,
  PageHeader,
  PageSection,
  SelectMenu,
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
  getCurrentPlatformAccess,
  listPlatformRoles,
  type PlatformRole,
} from "@/lib/access-control";
import { useSession } from "@/lib/session";
import {
  getUser,
  listUsers,
  type ManagedUser,
  type Paged,
  type StoreOption,
} from "@/lib/users";
import { UserEditor } from "./user-editor";
import {
  StorePicker,
  UserError,
  messageFor,
  title,
  platformRoleName,
} from "./user-store-picker";

export function UsersPage() {
  const session = useSession();
  const token = session.status === "authenticated" ? session.accessToken : null;
  const [result, setResult] = useState<Paged<ManagedUser> | null>(null);
  const [roles, setRoles] = useState<PlatformRole[]>([]),
    [canEdit, setCanEdit] = useState(false);
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [access, setAccess] = useState("");
  const [role, setRole] = useState("");
  const [store, setStore] = useState<StoreOption | null>(null);
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState("25"),
    [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true),
    [opening, setOpening] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [accessError, setAccessError] = useState("");
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  useEffect(() => {
    if (!token) return;
    let active = true;
    Promise.all([getCurrentPlatformAccess(token), listPlatformRoles(token)])
      .then(([permissions, nextRoles]) => {
        if (active) {
          setCanEdit(permissions.isSuperadmin);
          setRoles(nextRoles.data);
        }
      })
      .catch((caught) => {
        if (active) setAccessError(messageFor(caught));
      });
    return () => {
      active = false;
    };
  }, [token]);
  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      listUsers(token, {
        page,
        pageSize: Number(pageSize),
        search,
        status,
        access,
        role,
        storeId: store?.id,
      })
        .then((next) => {
          if (active) {
            setResult(next);
            setError("");
          }
        })
        .catch((caught) => {
          if (active) {
            setResult(null);
            setError(messageFor(caught));
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    token,
    page,
    pageSize,
    search,
    status,
    access,
    role,
    store?.id,
    revision,
  ]);
  async function edit(id: string) {
    if (!token) return;
    setOpening(true);
    setError("");
    setNotice("");
    try {
      setEditing(await getUser(token, id));
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setOpening(false);
    }
  }
  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Access Control"
        title="Users"
        description="Manage login accounts, Platform access and Store memberships."
        actions={
          <Button variant="outline" onClick={() => setRevision((v) => v + 1)}>
            <RefreshCwIcon aria-hidden="true" />
            Refresh
          </Button>
        }
      />
      {error ? <UserError message={error} /> : null}
      {accessError ? <UserError message={accessError} /> : null}
      {notice ? (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      <FilterBar
        search={
          <div className="min-w-64 flex-1">
            <Label htmlFor="user-search">Search users</Label>
            <Input
              id="user-search"
              placeholder="Search name or login email"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        }
        filters={
          <>
            <div>
              <Label>Status</Label>
              <SelectMenu
                ariaLabel="Filter account status"
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
                options={[
                  { value: "", label: "All statuses" },
                  ...["ACTIVE", "SUSPENDED", "DISABLED"].map((value) => ({
                    value,
                    label: title(value),
                  })),
                ]}
              />
            </div>
            <div>
              <Label>Role</Label>
              <SelectMenu
                ariaLabel="Filter role"
                value={role}
                onChange={(v) => {
                  setRole(v);
                  setPage(1);
                }}
                options={[
                  { value: "", label: "All roles" },
                  { value: "owner", label: "Store Owner" },
                  { value: "store-admin", label: "Store Admin" },
                  { value: "manager", label: "Store Manager" },
                  { value: "staff", label: "Store Staff" },
                  { value: "viewer", label: "Store Viewer" },
                  ...roles.map((r) => ({ value: r.id, label: r.name })),
                ]}
              />
            </div>
            <div>
              <Label>Access</Label>
              <SelectMenu
                ariaLabel="Filter access"
                value={access}
                onChange={(v) => {
                  setAccess(v);
                  setPage(1);
                }}
                options={[
                  { value: "", label: "All access" },
                  { value: "platform", label: "Platform roles" },
                  { value: "superadmin", label: "Protected Superadmin" },
                  { value: "store", label: "Store memberships" },
                  { value: "unlinked", label: "No access assigned" },
                ]}
              />
            </div>
            {token ? (
              <StorePicker
                token={token}
                label="Filter Store"
                value={store}
                onChange={(next) => {
                  setStore(next);
                  setPage(1);
                }}
              />
            ) : null}
          </>
        }
      />
      <PageSection>
        <TableContainer
          title="Users"
          description="The login email belongs to the user account. Store contact emails are managed separately."
          footer={
            <div className="flex w-full flex-wrap items-center justify-between gap-3 text-sm">
              <span>
                {result?.pagination.total ?? 0} users · Page {page} of{" "}
                {result?.pagination.totalPages ?? 1}
              </span>
              <div className="flex items-center gap-2">
                <SelectMenu
                  ariaLabel="Rows per page"
                  value={pageSize}
                  onChange={(value) => {
                    setPageSize(value);
                    setPage(1);
                  }}
                  options={["25", "50", "100"].map((value) => ({
                    value,
                    label: `${value} rows`,
                  }))}
                />
                <Button
                  variant="outline"
                  disabled={loading || page <= 1}
                  onClick={() => setPage((v) => v - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    loading || !result || page >= result.pagination.totalPages
                  }
                  onClick={() => setPage((v) => v + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User / login email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Platform access</TableHead>
                <TableHead>Store access</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6}>Loading users…</TableCell>
                </TableRow>
              ) : !result?.data.length ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    No users match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                result.data.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-medium">
                        {user.displayName || "Unnamed user"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {user.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={user.status}
                        label={title(user.status)}
                      />
                    </TableCell>
                    <TableCell>
                      {user.isProtectedSuperadmin ? (
                        <span className="font-medium">
                          Protected Superadmin
                        </span>
                      ) : (
                        <>
                          {user.staticPlatformRoles.map((role) => (
                            <div key={role}>
                              {platformRoleName(role)}{" "}
                              <span className="text-xs text-muted-foreground">
                                (bootstrap)
                              </span>
                            </div>
                          ))}
                          {user.platformRoles.map((role) => (
                            <div key={role.id}>
                              {role.name}
                              {role.isActive ? "" : " (inactive)"}
                            </div>
                          ))}
                          {!user.staticPlatformRoles.length &&
                          !user.platformRoles.length
                            ? "None"
                            : null}
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.memberships.length
                        ? user.memberships.map((link) => (
                            <div
                              key={link.membershipId}
                              className="mb-2 last:mb-0"
                            >
                              <div className="font-medium">
                                {link.storeName}
                                {link.storeStatus !== "ACTIVE"
                                  ? ` (${title(link.storeStatus)})`
                                  : ""}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {link.membershipRole === "ORGANIZATION_OWNER"
                                  ? "Store Owner · "
                                  : ""}
                                {link.roles
                                  .map((role) => role.name)
                                  .join(", ") || "No operational roles"}{" "}
                                · {title(link.status)}
                              </div>
                            </div>
                          ))
                        : "No Store linked"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {new Date(user.createdAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={opening || user.isProtectedSuperadmin}
                          onClick={() => void edit(user.id)}
                        >
                          <PencilIcon aria-hidden="true" />
                          Edit<span className="sr-only"> {user.email}</span>
                        </Button>
                      ) : (
                        "View only"
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </PageSection>
      {editing && token ? (
        <UserEditor
          key={`${editing.id}:${editing.version}`}
          token={token}
          user={editing}
          roles={roles}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setEditing(null);
            setNotice(`Changes saved for ${next.email}.`);
            setRevision((v) => v + 1);
          }}
          onOwnerAssigned={(next) => {
            setEditing(next);
            setNotice("First Store Owner assigned successfully.");
            setRevision((v) => v + 1);
          }}
        />
      ) : null}
    </PageContainer>
  );
}
