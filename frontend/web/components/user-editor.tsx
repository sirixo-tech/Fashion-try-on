"use client";

import { useEffect, useState, type FormEvent } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SelectMenu,
} from "@selfx/ui";
import { type PlatformRole } from "@/lib/access-control";
import { SafeApiError } from "@/lib/api";
import { listStoreRoles } from "@/lib/stores";
import {
  assignFirstStoreOwner,
  updateUser,
  type ManagedUser,
  type MembershipInput,
  type StoreOption,
  type UserMembership,
  type UserRole,
} from "@/lib/users";
import {
  StorePicker,
  UserError,
  messageFor,
  title,
  platformRoleName,
} from "./user-store-picker";

export function UserEditor({
  token,
  user,
  roles,
  onClose,
  onSaved,
  onOwnerAssigned,
}: {
  token: string;
  user: ManagedUser;
  roles: PlatformRole[];
  onClose: () => void;
  onSaved: (user: ManagedUser) => void;
  onOwnerAssigned: (user: ManagedUser) => void;
}) {
  const [name, setName] = useState(user.displayName ?? ""),
    [email, setEmail] = useState(user.email);
  const [status, setStatus] = useState(user.status),
    [password, setPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false);
  const [roleIds, setRoleIds] = useState(user.platformRoles.map((r) => r.id));
  const [links, setLinks] = useState<MembershipInput[]>([]),
    [addedStores, setAddedStores] = useState<StoreOption[]>([]);
  const [newStore, setNewStore] = useState<StoreOption | null>(null),
    [ownerStore, setOwnerStore] = useState<StoreOption | null>(null);
  const [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const changedRoles =
    [...roleIds].sort().join() !==
    user.platformRoles
      .map((r) => r.id)
      .sort()
      .join();
  const dirty =
    name !== (user.displayName ?? "") ||
    email !== user.email ||
    status !== user.status ||
    !!password ||
    changedRoles ||
    !!links.length;
  function changeLink(input: MembershipInput) {
    setLinks((current) => [
      ...current.filter((l) => l.storeId !== input.storeId),
      input,
    ]);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setFieldError("");
    if (!name.trim()) {
      setError("Enter a full name.");
      setFieldError("name");
      return;
    }
    if (password && password.length < 12) {
      setError("New password must contain at least 12 characters.");
      setFieldError("password");
      return;
    }
    setBusy(true);
    try {
      onSaved(
        await updateUser(token, user.id, {
          version: user.version,
          displayName: name.trim(),
          email: email.trim(),
          status,
          ...(password ? { newPassword: password } : {}),
          ...(changedRoles ? { platformRoleIds: roleIds } : {}),
          memberships: links,
        }),
      );
    } catch (caught) {
      setError(messageFor(caught));
      if (
        caught instanceof SafeApiError &&
        caught.code === "USER_EMAIL_CONFLICT"
      )
        setFieldError("email");
    } finally {
      setPassword("");
      setShowPassword(false);
      setBusy(false);
    }
  }
  async function assignOwner() {
    if (busy || !ownerStore || dirty) return;
    setBusy(true);
    setError("");
    try {
      onOwnerAssigned(
        await assignFirstStoreOwner(token, user.id, {
          version: user.version,
          storeId: ownerStore.id,
          confirmStoreName: confirmation,
        }),
      );
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
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Update {user.displayName || user.email}. Changes apply to this login
            account across its linked Stores.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void save(event)}
          aria-label="Edit user"
          className="flex min-h-0 flex-col gap-4"
        >
          {error ? <UserError message={error} /> : null}
          <fieldset
            disabled={busy}
            className="min-h-0 space-y-5 overflow-y-auto pr-1"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="edit-user-name">Full name</Label>
                <Input
                  id="edit-user-name"
                  required
                  maxLength={160}
                  value={name}
                  aria-invalid={fieldError === "name"}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="edit-user-email">Login email</Label>
                <Input
                  id="edit-user-email"
                  type="email"
                  required
                  maxLength={320}
                  value={email}
                  aria-invalid={fieldError === "email"}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Used for sign-in and password recovery. Store contact email
                  stays separate.
                </p>
              </div>
            </div>
            <div>
              <Label htmlFor="edit-user-password">
                New password (optional)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="edit-user-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={256}
                  placeholder="Leave blank to keep current password"
                  value={password}
                  aria-invalid={fieldError === "password"}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? (
                    <EyeOffIcon aria-hidden="true" />
                  ) : (
                    <EyeIcon aria-hidden="true" />
                  )}
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Changing login email or password signs the user out and
                invalidates existing reset links.
              </p>
            </div>
            <div>
              <Label>Account status</Label>
              <SelectMenu
                ariaLabel="Account status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "ACTIVE", label: "Active" },
                  { value: "SUSPENDED", label: "Suspended" },
                  { value: "DISABLED", label: "Disabled" },
                ]}
              />
            </div>
            <section
              className="space-y-2 border-t pt-4"
              aria-labelledby="platform-access-heading"
            >
              <h3 id="platform-access-heading" className="font-semibold">
                Platform access
              </h3>
              {user.staticPlatformRoles.length ? (
                <p className="text-sm text-muted-foreground">
                  Bootstrap access:{" "}
                  {user.staticPlatformRoles.map(platformRoleName).join(", ")}.
                  Changing bootstrap authority requires controlled account
                  maintenance.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Platform roles grant access across SelfX. Store roles below
                apply only to their selected Store.
              </p>
              {roles.map((role) => (
                <label
                  key={role.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={roleIds.includes(role.id)}
                    disabled={!role.isActive && !roleIds.includes(role.id)}
                    onCheckedChange={() =>
                      setRoleIds((current) =>
                        current.includes(role.id)
                          ? current.filter((id) => id !== role.id)
                          : [...current, role.id],
                      )
                    }
                  />
                  {role.name}
                  {role.isActive ? "" : " (inactive)"}
                </label>
              ))}
            </section>
            <section
              className="space-y-4 border-t pt-4"
              aria-labelledby="store-access-heading"
            >
              <h3 id="store-access-heading" className="font-semibold">
                Store memberships
              </h3>
              {!user.memberships.length && !addedStores.length ? (
                <p className="text-sm text-muted-foreground">
                  No Store linked.
                </p>
              ) : null}
              {user.memberships.map((link) => (
                <MembershipEditor
                  key={link.storeId}
                  token={token}
                  membership={link}
                  pending={links.find((l) => l.storeId === link.storeId)}
                  onChange={changeLink}
                />
              ))}
              {addedStores.map((store) => (
                <MembershipEditor
                  key={store.id}
                  token={token}
                  store={store}
                  pending={links.find((l) => l.storeId === store.id)}
                  onChange={changeLink}
                  onRemove={() => {
                    setAddedStores((current) =>
                      current.filter((s) => s.id !== store.id),
                    );
                    setLinks((current) =>
                      current.filter((l) => l.storeId !== store.id),
                    );
                  }}
                />
              ))}
              <div className="flex flex-wrap items-end gap-3">
                <StorePicker
                  token={token}
                  label="Link to Store"
                  value={newStore}
                  activeOnly
                  onChange={setNewStore}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    !newStore ||
                    [
                      ...user.memberships.map((m) => m.storeId),
                      ...addedStores.map((s) => s.id),
                    ].includes(newStore.id)
                  }
                  onClick={() => {
                    if (newStore) {
                      setAddedStores((current) => [...current, newStore]);
                      changeLink({
                        storeId: newStore.id,
                        status: "ACTIVE",
                        roleIds: [],
                      });
                      setNewStore(null);
                    }
                  }}
                >
                  Add Store membership
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                New links grant Store-wide scope using the selected roles and
                existing Store permission limits. Existing scopes stay
                unchanged. Revoke a membership to remove Store access.
              </p>
            </section>
            <section
              className="space-y-3 border-t pt-4"
              aria-labelledby="first-owner-heading"
            >
              <h3 id="first-owner-heading" className="font-semibold">
                Assign first Store Admin
              </h3>
              <p className="text-sm text-muted-foreground">
                For an active Store with no active Store Admin. Grants Store
                Admin permissions within its current permission limits.
              </p>
              <StorePicker
                token={token}
                label="Admin Store"
                value={ownerStore}
                activeOnly
                onChange={(value) => {
                  setOwnerStore(value);
                  setConfirmation("");
                }}
              />
              {ownerStore ? (
                <div>
                  <Label htmlFor="owner-confirmation">
                    Type “{ownerStore.name}” to confirm
                  </Label>
                  <Input
                    id="owner-confirmation"
                    autoComplete="off"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </div>
              ) : null}
              {dirty ? (
                <p className="text-sm text-muted-foreground">
                  Save your other changes and reopen Edit before assigning Store
                  Admin access.
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={
                  busy ||
                  dirty ||
                  user.status !== "ACTIVE" ||
                  !ownerStore ||
                  confirmation !== ownerStore.name
                }
                onClick={() => void assignOwner()}
              >
                Assign first Store Admin
              </Button>
            </section>
          </fieldset>
          <DialogFooter className="shrink-0 border-t bg-background pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !dirty}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MembershipEditor({
  token,
  membership,
  store,
  pending,
  onChange,
  onRemove,
}: {
  token: string;
  membership?: UserMembership;
  store?: StoreOption;
  pending?: MembershipInput;
  onChange: (input: MembershipInput) => void;
  onRemove?: () => void;
}) {
  const storeId = membership?.storeId ?? store!.id;
  const initial: MembershipInput = {
    storeId,
    ...(membership
      ? {
          membershipId: membership.membershipId,
          updatedAt: membership.updatedAt,
        }
      : {}),
    status:
      membership?.status === "ACTIVE"
        ? "ACTIVE"
        : membership?.status === "REVOKED"
          ? "REVOKED"
          : "SUSPENDED",
    roleIds: membership?.roles.map((r) => r.id) ?? [],
  };
  const value = pending ?? initial;
  const locked =
    (membership?.storeStatus !== undefined &&
      membership.storeStatus !== "ACTIVE") ||
    membership?.isStoreAdmin === true ||
    membership?.membershipRole === "ORGANIZATION_OWNER" ||
    Boolean(membership?.deletedAt);
  const [roles, setRoles] = useState<UserRole[]>([]),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [totalPages, setTotalPages] = useState(1),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (locked) return;
    let active = true;
    setLoading(true);
    listStoreRoles(token, storeId, { page, pageSize: 25 })
      .then((result) => {
        if (active) {
          setRoles(result.data);
          setTotalPages(result.pagination.totalPages);
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
  }, [token, storeId, locked, page]);
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-medium">{membership?.storeName ?? store?.name}</h4>
        {onRemove ? (
          <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
            Remove new link
          </Button>
        ) : null}
      </div>
      {locked ? (
        <p className="text-sm text-muted-foreground">
          {membership?.roles.map((r) => r.name).join(", ") ||
            "No operational roles"}{" "}
          · {title(membership!.status)} · {title(membership!.storeStatus)}.{" "}
          {membership?.isStoreAdmin ||
          membership?.membershipRole === "ORGANIZATION_OWNER"
            ? "Store Admin links are protected in this account editor."
            : membership?.deletedAt
              ? "Deleted links cannot be restored."
              : "Inactive Store links are read-only."}
        </p>
      ) : (
        <>
          <SelectMenu
            ariaLabel={`Membership status for ${membership?.storeName ?? store?.name}`}
            value={value.status}
            onChange={(status) => onChange({ ...value, status })}
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "SUSPENDED", label: "Suspended" },
              { value: "REVOKED", label: "Revoked" },
            ]}
          />
          {error ? <UserError message={error} /> : null}
          {loading ? (
            <p className="text-sm">Loading Store roles…</p>
          ) : (
            roles.map((role) => (
              <label key={role.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={value.roleIds.includes(role.id)}
                  disabled={!role.isActive && !value.roleIds.includes(role.id)}
                  onCheckedChange={() =>
                    onChange({
                      ...value,
                      roleIds: value.roleIds.includes(role.id)
                        ? value.roleIds.filter((id) => id !== role.id)
                        : [...value.roleIds, role.id],
                    })
                  }
                />
                {role.name}
                {role.isActive ? "" : " (inactive)"}
              </label>
            ))
          )}
          {totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page === 1 || loading}
                onClick={() => setPage((v) => v - 1)}
              >
                Previous roles
              </Button>
              <span className="text-xs">
                {page} / {totalPages}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page === totalPages || loading}
                onClick={() => setPage((v) => v + 1)}
              >
                Next roles
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
