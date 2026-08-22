"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FilterIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";

import {
  Button,
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
  listAccessPermissions,
  type AccessPermission,
} from "@/lib/access-control";
import { SafeApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function PermissionsPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [permissions, setPermissions] = useState<AccessPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await listAccessPermissions(accessToken);
      setPermissions(response.data);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const modules = useMemo(
    () => uniqueSorted(permissions.map((permission) => permission.module)),
    [permissions],
  );
  const actions = useMemo(
    () => uniqueSorted(permissions.map((permission) => permission.action)),
    [permissions],
  );
  const filteredPermissions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return permissions.filter((permission) => {
      const matchesSearch =
        query.length === 0 ||
        [
          permission.label,
          permission.code,
          permission.module,
          permission.action,
          permission.description ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesModule =
        moduleFilter === "all" || permission.module === moduleFilter;
      const matchesAction =
        actionFilter === "all" || permission.action === actionFilter;

      return matchesSearch && matchesModule && matchesAction;
    });
  }, [actionFilter, moduleFilter, permissions, search]);
  const hasFilters =
    search.trim().length > 0 ||
    moduleFilter !== "all" ||
    actionFilter !== "all";

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Access Control"
        title="Permission Registry"
        description="Read-only canonical SelfX permissions used by platform and Store RBAC."
        actions={
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCwIcon aria-hidden="true" />
            Refresh
          </Button>
        }
      />
      {error ? <AccessError message={error} /> : null}
      <PageSection>
        <TableContainer
          title="Global Permissions"
          description={
            loading
              ? "Loading permission definitions..."
              : `Showing ${filteredPermissions.length} of ${permissions.length} permissions.`
          }
        >
          <div className="mb-4 flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={search}
                placeholder="Search permissions..."
                className="pl-8"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterIcon
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <select
                value={moduleFilter}
                className={selectClassName}
                onChange={(event) => setModuleFilter(event.target.value)}
              >
                <option value="all">All modules</option>
                {modules.map((module) => (
                  <option key={module} value={module}>
                    {module}
                  </option>
                ))}
              </select>
              <select
                value={actionFilter}
                className={selectClassName}
                onChange={(event) => setActionFilter(event.target.value)}
              >
                <option value="all">All actions</option>
                {actions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
              {hasFilters ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setModuleFilter("all");
                    setActionFilter("all");
                  }}
                >
                  <XIcon aria-hidden="true" />
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Permission</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3}>Loading permissions...</TableCell>
                </TableRow>
              ) : permissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3}>No permissions found.</TableCell>
                </TableRow>
              ) : filteredPermissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3}>
                    No permissions match the current search and filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredPermissions.map((permission) => (
                  <TableRow key={permission.id}>
                    <TableCell>
                      <div className="font-medium">{permission.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {permission.code}
                      </div>
                    </TableCell>
                    <TableCell>{permission.module}</TableCell>
                    <TableCell>{permission.action}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </PageSection>
    </PageContainer>
  );
}

const selectClassName =
  "h-8 min-w-36 rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
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
