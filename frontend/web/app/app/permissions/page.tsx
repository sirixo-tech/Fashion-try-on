"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCwIcon, ShieldAlertIcon } from "lucide-react";

import {
  Button,
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
        <TableContainer title="Global Permissions">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Permission</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Scope</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4}>Loading permissions...</TableCell>
                </TableRow>
              ) : permissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>No permissions found.</TableCell>
                </TableRow>
              ) : (
                permissions.map((permission) => (
                  <TableRow key={permission.id}>
                    <TableCell>
                      <div className="font-medium">{permission.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {permission.code}
                      </div>
                    </TableCell>
                    <TableCell>{permission.module}</TableCell>
                    <TableCell>{permission.action}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={permission.applicability}
                        label={permission.applicability}
                      />
                    </TableCell>
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
