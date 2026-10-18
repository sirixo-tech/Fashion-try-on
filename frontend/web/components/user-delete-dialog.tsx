"use client";
import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Label,
} from "@selfx/ui";
import { UserError, messageFor } from "./user-store-picker";

export function UserDeleteDialog({
  name,
  email,
  description,
  onClose,
  onDelete,
}: {
  name: string;
  email: string;
  description: string;
  onClose: () => void;
  onDelete: (confirmEmail: string) => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onDelete(confirmation);
      onClose();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {name}?</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? <UserError message={error} /> : null}
        <div className="space-y-2">
          <Label htmlFor="delete-user-confirm">Type {email} to confirm</Label>
          <Input
            id="delete-user-confirm"
            value={confirmation}
            disabled={busy}
            autoComplete="off"
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={
              busy || confirmation.trim().toLowerCase() !== email.toLowerCase()
            }
            onClick={() => void remove()}
          >
            {busy ? "Deleting…" : "Delete user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
