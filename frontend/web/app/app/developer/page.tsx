"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircleIcon,
  CopyIcon,
  KeyRoundIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";

import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
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
  getCurrentPlatformAccess,
  type CurrentPlatformAccess,
} from "@/lib/access-control";
import { SafeApiError } from "@/lib/api";
import {
  createDeveloperApiKey,
  listDeveloperApiKeys,
  revokeDeveloperApiKey,
  type DeveloperApiKey,
  type DeveloperApiKeyEnvironment,
  type DeveloperApiKeyScope,
} from "@/lib/developer-api";
import { listActiveOrganizations } from "@/lib/organizations";
import { useSession } from "@/lib/session";
import { listStores, type AdminStore } from "@/lib/stores";

const apiKeyScopes: Array<{
  value: DeveloperApiKeyScope;
  label: string;
  description: string;
}> = [
  {
    value: "tryon:create",
    label: "Create Try-On",
    description: "Create Public API Try-On requests when enabled.",
  },
  {
    value: "tryon:read",
    label: "Read Try-On",
    description: "Read Public API Try-On status and results.",
  },
  {
    value: "usage:read",
    label: "Read Usage",
    description: "Read approved Store usage summaries.",
  },
  {
    value: "webhooks:manage",
    label: "Manage Webhooks",
    description: "Manage webhook endpoints when webhooks are enabled.",
  },
];

type StoreOption = { id: string; name: string };

type CreateKeyDraft = {
  name: string;
  environment: DeveloperApiKeyEnvironment;
  scopes: DeveloperApiKeyScope[];
};

const defaultCreateDraft: CreateKeyDraft = {
  name: "",
  environment: "TEST",
  scopes: ["tryon:create", "tryon:read"],
};

export default function DeveloperPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [platformAccess, setPlatformAccess] =
    useState<CurrentPlatformAccess | null>(null);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [keys, setKeys] = useState<DeveloperApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<CreateKeyDraft>(defaultCreateDraft);
  const [createdSecret, setCreatedSecret] = useState<{
    name: string;
    secret: string;
  } | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPlatformDeveloperAccess = Boolean(
    platformAccess?.isSuperadmin ||
    platformAccess?.permissions.includes("DEVELOPER_API_VIEW") ||
    platformAccess?.permissions.includes("DEVELOPER_API_MANAGE"),
  );
  const canManagePlatformDeveloperApi = Boolean(
    platformAccess?.isSuperadmin ||
    platformAccess?.permissions.includes("DEVELOPER_API_MANAGE"),
  );
  const canManageSelectedDeveloperApi = Boolean(
    canManagePlatformDeveloperApi ||
      (!hasPlatformDeveloperAccess && selectedStoreId),
  );
  const selectedStoreName =
    storeOptions.find((store) => store.id === selectedStoreId)?.name ?? "";
  const canCreate =
    Boolean(selectedStoreId) && canManageSelectedDeveloperApi && !saving;

  const loadAccess = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setError(null);
    try {
      const access = await getCurrentPlatformAccess(accessToken);
      setPlatformAccess(access);
      if (
        access.isSuperadmin ||
        access.permissions.includes("STORES_VIEW") ||
        access.permissions.includes("DEVELOPER_API_VIEW") ||
        access.permissions.includes("DEVELOPER_API_MANAGE")
      ) {
        const response = await listStores(accessToken, { pageSize: 100 });
        setStoreOptions(response.data.map(storeOptionFromAdminStore));
        return;
      }

      const stores = await listActiveOrganizations(accessToken);
      const options = stores.map((store) => ({
        id: store.id,
        name: store.name,
      }));
      setStoreOptions(options);
      setSelectedStoreId((current) => current || options[0]?.id || "");
    } catch (caught) {
      setError(messageFor(caught));
      setPlatformAccess({ isSuperadmin: false, permissions: [] });
      setStoreOptions([]);
    }
  }, [accessToken]);

  const loadKeys = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    if (!hasPlatformDeveloperAccess && !selectedStoreId) {
      setKeys([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await listDeveloperApiKeys(accessToken, {
        storeId: selectedStoreId || undefined,
        pageSize: 50,
      });
      setKeys(response.data);
    } catch (caught) {
      setError(messageFor(caught));
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, hasPlatformDeveloperAccess, selectedStoreId]);

  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const activeKeys = useMemo(
    () => keys.filter((key) => key.status === "ACTIVE").length,
    [keys],
  );

  async function createKey() {
    if (!accessToken || !selectedStoreId || !canManageSelectedDeveloperApi) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await createDeveloperApiKey(accessToken, {
        storeId: selectedStoreId,
        name: draft.name,
        environment: draft.environment,
        scopes: draft.scopes,
      });
      setKeys((current) => [response.apiKey, ...current]);
      setCreatedSecret({
        name: response.apiKey.name,
        secret: response.secret,
      });
      setSecretCopied(false);
      setDraft(defaultCreateDraft);
      setCreateOpen(false);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  async function revokeKey(keyId: string) {
    if (!accessToken || !canManageSelectedDeveloperApi) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const revoked = await revokeDeveloperApiKey(accessToken, keyId);
      setKeys((current) =>
        current.map((key) => (key.id === revoked.id ? revoked : key)),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  async function copySecret() {
    if (!createdSecret) {
      return;
    }
    await navigator.clipboard.writeText(createdSecret.secret);
    setSecretCopied(true);
  }

  function toggleScope(scope: DeveloperApiKeyScope) {
    setDraft((current) => {
      const selected = current.scopes.includes(scope);
      const scopes = selected
        ? current.scopes.filter((entry) => entry !== scope)
        : [...current.scopes, scope];
      return { ...current, scopes };
    });
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Developer"
        title="Developer / API"
        description="Create scoped Store API keys for external SelfX integrations. Secrets are shown once and never stored in plaintext."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={() => void loadKeys()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            <Button
              disabled={!canCreate}
              onClick={() => setCreateOpen(true)}
              title={
                canManageSelectedDeveloperApi
                  ? undefined
                  : "Developer API manage permission is required."
              }
            >
              <PlusIcon aria-hidden="true" />
              Create API Key
            </Button>
          </div>
        }
      />

      {error ? (
        <PageSection>
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <ShieldAlertIcon size={18} aria-hidden="true" />
            {error}
          </div>
        </PageSection>
      ) : null}

      <PageSection>
        <div className="grid gap-4 lg:grid-cols-[minmax(17rem,0.35fr)_minmax(0,1fr)]">
          <TableContainer
            title="API Context"
            description="Keys are owned by a Store tenant."
          >
            <div className="space-y-4">
              <label className="space-y-2 text-sm">
                <span className="font-medium">Store</span>
                <select
                  value={selectedStoreId}
                  onChange={(event) => setSelectedStoreId(event.target.value)}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/35"
                >
                  {hasPlatformDeveloperAccess ? (
                    <option value="">All Stores</option>
                  ) : null}
                  {storeOptions.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <SummaryTile label="Total keys" value={keys.length} />
                <SummaryTile label="Active" value={activeKeys} />
              </div>
              <div className="rounded-lg border bg-muted/25 p-3 text-xs leading-5 text-muted-foreground">
                Use separate keys per integration and revoke any key that is no
                longer needed. Full secrets are shown only at creation.
              </div>
            </div>
          </TableContainer>

          <TableContainer
            title="API Keys"
            description={
              selectedStoreName
                ? `Keys for ${selectedStoreName}.`
                : "Keys across all accessible Stores."
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7}>Loading API keys...</TableCell>
                  </TableRow>
                ) : keys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      No Developer API keys have been created yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell>
                        <div className="font-medium">{key.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {key.storeName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="rounded-md border bg-muted/40 px-2 py-1 text-xs">
                          {key.keyPrefix}...
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            key.environment === "LIVE"
                              ? "border-orange-200 bg-orange-50 text-orange-700"
                              : "border-blue-200 bg-blue-50 text-blue-700"
                          }
                        >
                          {key.environment.toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-72 flex-wrap gap-1.5">
                          {key.scopes.map((scope) => (
                            <Badge key={scope} variant="secondary">
                              {scope}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(key.lastUsedAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={key.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {key.status === "ACTIVE" &&
                        canManageSelectedDeveloperApi ? (
                          <ConfirmDialog
                            title="Revoke API key?"
                            description={`Revoke ${key.name}? Existing integrations using this key will stop working.`}
                            confirmLabel="Revoke"
                            destructive
                            onConfirm={() => void revokeKey(key.id)}
                            trigger={
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={saving}
                              >
                                <Trash2Icon aria-hidden="true" />
                                Revoke
                              </Button>
                            }
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {key.status === "ACTIVE" ? "View only" : "Revoked"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      </PageSection>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a scoped key for {selectedStoreName || "this Store"}. The
              secret will be visible only once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="space-y-2 text-sm">
              <span>Name</span>
              <Input
                value={draft.name}
                maxLength={120}
                placeholder="Website integration"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <div className="space-y-2 text-sm">
              <Label>Environment</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["TEST", "LIVE"] as const).map((environment) => (
                  <Button
                    key={environment}
                    type="button"
                    variant={
                      draft.environment === environment ? "default" : "outline"
                    }
                    onClick={() =>
                      setDraft((current) => ({ ...current, environment }))
                    }
                  >
                    {environment === "TEST" ? "Test" : "Live"}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <Label>Scopes</Label>
              <div className="grid gap-2">
                {apiKeyScopes.map((scope) => (
                  <label
                    key={scope.value}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                  >
                    <input
                      type="checkbox"
                      checked={draft.scopes.includes(scope.value)}
                      onChange={() => toggleScope(scope.value)}
                      className="mt-1 size-4"
                    />
                    <span>
                      <span className="block font-medium">{scope.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {scope.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={saving || !draft.name.trim() || draft.scopes.length < 1}
              onClick={() => void createKey()}
            >
              <KeyRoundIcon aria-hidden="true" />
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(createdSecret)}
        onOpenChange={(open) => {
          if (!open) {
            setCreatedSecret(null);
            setSecretCopied(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy API Secret</DialogTitle>
            <DialogDescription>
              This secret for {createdSecret?.name} is shown only once. Store it
              securely before closing.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-3">
            <code className="block break-all text-sm">
              {createdSecret?.secret}
            </code>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatedSecret(null)}>
              Done
            </Button>
            <Button onClick={() => void copySecret()}>
              {secretCopied ? (
                <CheckCircleIcon aria-hidden="true" />
              ) : (
                <CopyIcon aria-hidden="true" />
              )}
              {secretCopied ? "Copied" : "Copy Secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function storeOptionFromAdminStore(store: AdminStore): StoreOption {
  return { id: store.id, name: store.name };
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Never";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  return "Developer API settings could not be loaded.";
}
