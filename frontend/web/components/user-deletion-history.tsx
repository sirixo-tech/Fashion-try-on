"use client";
import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@selfx/ui";
import { selfxApi } from "@/lib/api";
import { type Paged } from "@/lib/users";
import { UserError, messageFor, title } from "./user-store-picker";
type Snapshot = {
  id?: string;
  displayName?: string | null;
  email?: string;
  label?: string;
};
type Event = {
  id: string;
  action: string;
  createdAt: string;
  metadata: {
    deleted_user?: Snapshot;
    associated_users?: Snapshot[];
    deleted_store?: { name: string };
  } | null;
};
export function UserDeletionHistory({
  token,
  onClose,
}: {
  token: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1),
    [result, setResult] = useState<Paged<Event> | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    selfxApi<Paged<Event>>(
      `/api/v1/admin/users/deletion-history?page=${page}&pageSize=25`,
      { accessToken: token },
    )
      .then((next) => {
        if (active) {
          setResult(next);
          setError("");
        }
      })
      .catch((caught) => {
        if (active) setError(messageFor(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, page]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Deletion history</DialogTitle>
          <DialogDescription>
            Retained name and email snapshots remain identifiable after
            permanent account deletion.
          </DialogDescription>
        </DialogHeader>
        {error ? <UserError message={error} /> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User details</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3}>Loading history…</TableCell>
              </TableRow>
            ) : !result?.data.length ? (
              <TableRow>
                <TableCell colSpan={3}>No deletion history.</TableCell>
              </TableRow>
            ) : (
              result.data.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    {[
                      ...(event.metadata?.deleted_user
                        ? [event.metadata.deleted_user]
                        : []),
                      ...(event.metadata?.associated_users ?? []),
                    ].map((user, i) => (
                      <div key={`${user.id}-${i}`} className="mb-2">
                        <div>
                          {user.label ||
                            `${user.displayName || user.email || "User"} (Deleted user)`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {user.email}
                        </div>
                      </div>
                    ))}
                    {event.metadata?.deleted_store ? (
                      <div className="text-xs">
                        Store: {event.metadata.deleted_store.name}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{title(event.action)}</TableCell>
                  <TableCell>
                    {new Date(event.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            disabled={loading || page <= 1}
            onClick={() => setPage((v) => v - 1)}
          >
            Previous
          </Button>
          <span className="text-sm">
            {page} / {result?.pagination.totalPages ?? 1}
          </span>
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
      </DialogContent>
    </Dialog>
  );
}
