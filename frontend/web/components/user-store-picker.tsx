"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Label,
  SelectMenu,
} from "@selfx/ui";
import { SafeApiError } from "@/lib/api";
import { listUserStores, type Paged, type StoreOption } from "@/lib/users";

export function StorePicker({
  token,
  label,
  value,
  activeOnly = false,
  onChange,
}: {
  token: string;
  label: string;
  value: StoreOption | null;
  activeOnly?: boolean;
  onChange: (store: StoreOption | null) => void;
}) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [result, setResult] = useState<Paged<StoreOption> | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      listUserStores(token, { page, search })
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
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [token, page, search]);
  const stores = result?.data ?? [];
  const options = [
    { value: "", label: activeOnly ? "Select a Store" : "All Stores" },
    ...[
      ...(value && !stores.some((s) => s.id === value.id) ? [value] : []),
      ...stores,
    ].map((s) => ({
      value: s.id,
      label: `${s.name}${s.status !== "ACTIVE" ? ` (${title(s.status)})` : ""}`,
      disabled: activeOnly && s.status !== "ACTIVE",
    })),
  ];
  return (
    <div className="min-w-52 space-y-1">
      <Label>{label}</Label>
      <Input
        aria-label={`Search ${label}`}
        placeholder="Search Stores"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      <SelectMenu
        ariaLabel={label}
        value={value?.id ?? ""}
        options={options}
        onChange={(id) =>
          onChange(
            stores.find((s) => s.id === id) ??
              (value?.id === id ? value : null),
          )
        }
      />
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading Stores…</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {result && result.pagination.totalPages > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={page === 1 || loading}
            onClick={() => setPage((v) => v - 1)}
          >
            Previous Stores
          </Button>
          <span className="text-xs">
            {page} / {result.pagination.totalPages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={page === result.pagination.totalPages || loading}
            onClick={() => setPage((v) => v + 1)}
          >
            Next Stores
          </Button>
        </div>
      ) : null}
    </div>
  );
}
export function title(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
}
export function platformRoleName(value: string) {
  if (value === "SELFX_STAFF_ADMIN") return "Platform Admin";
  if (value === "SELFX_SUPPORT_ADMIN") return "Platform Staff";
  if (value === "SELFX_SUPER_ADMIN") return "Platform Superadmin";
  return title(value.replace(/^SELFX_/, ""));
}
export function UserError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
export function messageFor(error: unknown) {
  return error instanceof SafeApiError
    ? error.message
    : "The request could not be completed. Try again.";
}
