"use client";

import { useEffect, useState } from "react";
import { Button, Checkbox, Input, Label, SelectMenu } from "@selfx/ui";
import {
  assignStoreAdmin,
  listUsers,
  updateStoreAdminEmail,
  type ManagedUser,
  type Paged,
} from "@/lib/users";
import { UserError, messageFor, title } from "./user-store-picker";

export function StoreAdminAccounts({
  token,
  storeId,
  storeName,
  disabled,
  onBusyChange,
}: {
  token: string;
  storeId: string;
  storeName: string;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [admins, setAdmins] = useState<Paged<ManagedUser> | null>(null);
  const [adminPage, setAdminPage] = useState(1);
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [email, setEmail] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [adding, setAdding] = useState(false),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const [candidates, setCandidates] = useState<Paged<ManagedUser> | null>(null),
    [candidateLoading, setCandidateLoading] = useState(false);
  const [candidate, setCandidate] = useState<ManagedUser | null>(null),
    [confirmation, setConfirmation] = useState("");
  const locked = disabled || busy;

  function choose(user: ManagedUser | null) {
    setSelected(user);
    setEmail(user?.email ?? "");
    setAcknowledged(false);
    setError("");
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    listUsers(token, {
      storeId,
      role: "store-admin",
      deleted: "active",
      page: adminPage,
      pageSize: 25,
    })
      .then((result) => {
        if (active) {
          setAdmins(result);
          choose(result.data[0] ?? null);
        }
      })
      .catch((caught) => {
        if (active) {
          setAdmins(null);
          choose(null);
          setError(messageFor(caught));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, storeId, adminPage, revision]);
  useEffect(() => {
    if (!adding) return;
    let active = true;
    setCandidateLoading(true);
    const timer = setTimeout(() => {
      listUsers(token, {
        status: "ACTIVE",
        deleted: "active",
        search,
        page,
        pageSize: 25,
      })
        .then((result) => {
          if (active) setCandidates(result);
        })
        .catch((caught) => {
          if (active) {
            setCandidates(null);
            setError(messageFor(caught));
          }
        })
        .finally(() => {
          if (active) setCandidateLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [token, adding, search, page]);

  async function saveEmail() {
    if (!selected || locked) return;
    setBusy(true);
    onBusyChange(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateStoreAdminEmail(
        token,
        selected,
        storeId,
        email.trim(),
      );
      choose(updated);
      setAdmins((current) =>
        current
          ? {
              ...current,
              data: current.data.map((user) =>
                user.id === updated.id ? updated : user,
              ),
            }
          : current,
      );
      setNotice(
        "Login email saved. The account must sign in again using the new email.",
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  async function assign() {
    if (!candidate || locked || confirmation !== storeName) return;
    setBusy(true);
    onBusyChange(true);
    setError("");
    setNotice("");
    try {
      await assignStoreAdmin(token, candidate, storeId, confirmation);
      setAdding(false);
      setCandidate(null);
      setConfirmation("");
      setAdminPage(1);
      setRevision((value) => value + 1);
      setNotice(
        "Store Admin assigned. Existing admins and the account's other Store access are retained.",
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  const shared =
    (selected?.memberships.filter(
      (link) => !link.deletedAt && link.storeId !== storeId,
    ).length ?? 0) > 0;
  const choices =
    candidates?.data.filter(
      (user) =>
        !user.isProtectedSuperadmin &&
        !user.memberships.some(
          (link) =>
            link.storeId === storeId &&
            (link.deletedAt || (link.isStoreAdmin && link.status === "ACTIVE")),
        ),
    ) ?? [];
  return (
    <section
      className="space-y-3 border-t pt-4"
      aria-labelledby="store-admin-heading"
    >
      <h3 id="store-admin-heading" className="font-semibold">
        Store Admin account
      </h3>
      <p className="text-sm text-muted-foreground">
        Manage the login account linked to this Store. Contact Email above is
        saved separately.
      </p>
      {error ? <UserError message={error} /> : null}
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm">Loading Store Admin accounts…</p>
      ) : admins?.data.length ? (
        <>
          <SelectMenu
            ariaLabel="Store Admin account"
            value={selected?.id ?? ""}
            disabled={locked}
            onChange={(id) =>
              choose(admins.data.find((user) => user.id === id) ?? null)
            }
            options={admins.data.map((user) => ({
              value: user.id,
              label: `${user.displayName || user.email} — ${user.email} (${title(user.status)})`,
            }))}
          />
          {selected ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="store-admin-email">Admin login email</Label>
                <Input
                  id="store-admin-email"
                  type="email"
                  autoComplete="off"
                  maxLength={320}
                  value={email}
                  disabled={locked || selected.isProtectedSuperadmin}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setAcknowledged(false);
                  }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Used for sign-in and password reset. Saving signs this account
                out of existing sessions.
              </p>
              {shared ? (
                <div className="space-y-2 rounded-lg border p-3 text-sm">
                  <p>
                    This account is also linked to:{" "}
                    {selected.memberships
                      .filter(
                        (link) => !link.deletedAt && link.storeId !== storeId,
                      )
                      .map((link) => link.storeName)
                      .join(", ")}
                    .
                  </p>
                  <label className="flex items-start gap-2">
                    <Checkbox
                      checked={acknowledged}
                      disabled={locked}
                      onCheckedChange={(value) =>
                        setAcknowledged(value === true)
                      }
                    />
                    I understand the login email changes for this account across
                    all its linked Stores.
                  </label>
                </div>
              ) : null}
              {selected.isProtectedSuperadmin ? (
                <p className="text-sm">
                  Protected Superadmin accounts cannot be edited here.
                </p>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  locked ||
                  selected.isProtectedSuperadmin ||
                  !email.trim() ||
                  email.trim().toLowerCase() === selected.email.toLowerCase() ||
                  (shared && !acknowledged)
                }
                onClick={() => void saveEmail()}
              >
                Save login email
              </Button>
            </div>
          ) : null}
          <Pager
            page={adminPage}
            pages={admins.pagination.totalPages}
            disabled={locked || loading}
            onChange={setAdminPage}
            label="Store Admin accounts"
          />
        </>
      ) : admins ? (
        <p className="text-sm">
          No Store Admin account is linked. Assign an existing account below.
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={locked || loading || !admins}
        onClick={() => {
          setAdding((value) => !value);
          setCandidate(null);
          setConfirmation("");
          setError("");
        }}
      >
        {" "}
        {adding ? "Cancel assignment" : "Assign existing account"}
      </Button>
      {adding ? (
        <div className="space-y-3 rounded-lg border p-3">
          <p className="text-sm text-muted-foreground">
            Add Store Admin access for an existing active account. Its password,
            login email and other Store memberships stay unchanged. Current
            Store Admins retain their access.
          </p>
          <Label htmlFor="store-admin-search">
            Search account name or login email
          </Label>
          <Input
            id="store-admin-search"
            value={search}
            disabled={locked}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
              setCandidate(null);
              setConfirmation("");
            }}
          />
          <SelectMenu
            ariaLabel="Existing account"
            value={candidate?.id ?? ""}
            disabled={locked || candidateLoading}
            options={[
              {
                value: "",
                label: candidateLoading
                  ? "Loading accounts…"
                  : "Select an existing account",
              },
              ...choices.map((user) => ({
                value: user.id,
                label: `${user.displayName || user.email} — ${user.email}`,
              })),
            ]}
            onChange={(id) => {
              setCandidate(choices.find((user) => user.id === id) ?? null);
              setConfirmation("");
            }}
          />
          {!candidateLoading && candidates && !choices.length ? (
            <p className="text-sm">No eligible accounts on this page.</p>
          ) : null}
          <Pager
            page={page}
            pages={candidates?.pagination.totalPages ?? 1}
            disabled={locked || candidateLoading}
            onChange={(next) => {
              setPage(next);
              setCandidate(null);
              setConfirmation("");
            }}
            label="Existing accounts"
          />
          {candidate ? (
            <>
              <p className="text-sm">
                Assign {candidate.displayName || candidate.email} (
                {candidate.email}) as a Store Admin for {storeName}.
              </p>
              <Label htmlFor="store-admin-confirm">
                Type “{storeName}” to confirm
              </Label>
              <Input
                id="store-admin-confirm"
                autoComplete="off"
                value={confirmation}
                disabled={locked}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={locked || !candidate || confirmation !== storeName}
            onClick={() => void assign()}
          >
            Assign Store Admin
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function Pager({
  page,
  pages,
  disabled,
  onChange,
  label,
}: {
  page: number;
  pages: number;
  disabled: boolean;
  onChange: (page: number) => void;
  label: string;
}) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Previous ${label}`}
        disabled={disabled || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </Button>
      <span>
        {page} / {pages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Next ${label}`}
        disabled={disabled || page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}
