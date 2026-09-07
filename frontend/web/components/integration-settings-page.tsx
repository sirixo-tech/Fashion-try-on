"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  CheckCircleIcon,
  CopyIcon,
  LinkIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  Trash2Icon,
  UnplugIcon,
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
  type CurrentPlatformAccess,
} from "@/lib/access-control";
import { SafeApiError } from "@/lib/api";
import {
  connectIntegration,
  createIntegrationCredential,
  disconnectIntegration,
  listIntegrations,
  revokeIntegrationCredential,
  startShopifyOauth,
  syncShopifyCatalog,
  type IntegrationCredential,
  type IntegrationCredentialScope,
  type IntegrationType,
  type StoreIntegration,
} from "@/lib/integrations";
import { listActiveOrganizations } from "@/lib/organizations";
import { useSession } from "@/lib/session";
import {
  getEffectiveStorePermissions,
  listStores,
  type AdminStore,
  type EffectiveStorePermissions,
} from "@/lib/stores";

const credentialScopes: Array<{
  value: IntegrationCredentialScope;
  label: string;
}> = [
  { value: "catalog:sync", label: "Catalog sync" },
  { value: "products:read", label: "Read products" },
  { value: "tryon:create", label: "Create Try-On" },
  { value: "tryon:read", label: "Read Try-On" },
  { value: "webhooks:receive", label: "Receive webhooks" },
];

const defaultCredentialScopes: IntegrationCredentialScope[] = [
  "catalog:sync",
  "products:read",
  "tryon:create",
  "tryon:read",
  "webhooks:receive",
];

type StoreOption = { id: string; name: string };

type CredentialDraft = {
  name: string;
  scopes: IntegrationCredentialScope[];
};

type ConnectionDraft = {
  externalAccountId: string;
  externalAccountName: string;
};

export function IntegrationSettingsPage({
  type,
  title,
}: {
  type: IntegrationType;
  title: string;
}) {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [platformAccess, setPlatformAccess] =
    useState<CurrentPlatformAccess | null>(null);
  const [selectedStoreAccess, setSelectedStoreAccess] =
    useState<EffectiveStorePermissions | null>(null);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [integration, setIntegration] = useState<StoreIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [credentialOpen, setCredentialOpen] = useState(false);
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft>({
    externalAccountId: "",
    externalAccountName: "",
  });
  const [credentialDraft, setCredentialDraft] = useState<CredentialDraft>({
    name: `${title} plugin`,
    scopes: defaultCredentialScopes,
  });
  const [createdSecret, setCreatedSecret] = useState<{
    name: string;
    secret: string;
  } | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPlatformIntegrationAccess = Boolean(
    platformAccess?.isSuperadmin ||
    platformAccess?.permissions.includes("INTEGRATIONS_VIEW") ||
    platformAccess?.permissions.includes("INTEGRATIONS_MANAGE"),
  );
  const canManagePlatformIntegrations = Boolean(
    platformAccess?.isSuperadmin ||
    platformAccess?.permissions.includes("INTEGRATIONS_MANAGE"),
  );
  const canViewSelectedIntegration = Boolean(
    hasPlatformIntegrationAccess ||
    selectedStoreAccess?.platformBypass ||
    selectedStoreAccess?.permissions.includes("integrations.view") ||
    selectedStoreAccess?.permissions.includes("integrations.manage"),
  );
  const canManageSelectedIntegration = Boolean(
    canManagePlatformIntegrations ||
    selectedStoreAccess?.platformBypass ||
    selectedStoreAccess?.permissions.includes("integrations.manage"),
  );
  const selectedStoreName =
    storeOptions.find((store) => store.id === selectedStoreId)?.name ?? "";
  const activeCredentials = useMemo(
    () =>
      integration?.credentials.filter(
        (credential) => credential.status === "ACTIVE",
      ).length ?? 0,
    [integration],
  );

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
        access.permissions.includes("INTEGRATIONS_VIEW") ||
        access.permissions.includes("INTEGRATIONS_MANAGE")
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

  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callbackStoreId = params.get("storeId");
    const oauth = params.get("oauth");
    if (callbackStoreId) {
      setSelectedStoreId(callbackStoreId);
    }
    if (oauth === "sync_failed") {
      setError(
        "Shopify connected, but the first catalog sync failed. Use Sync Catalog to try again.",
      );
    }
  }, []);

  useEffect(() => {
    if (!accessToken || !selectedStoreId) {
      setSelectedStoreAccess(null);
      return;
    }
    let cancelled = false;
    getEffectiveStorePermissions(accessToken, selectedStoreId)
      .then((nextAccess) => {
        if (!cancelled) {
          setSelectedStoreAccess(nextAccess);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedStoreAccess(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedStoreId]);

  const loadIntegration = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    if (!selectedStoreId || !canViewSelectedIntegration) {
      setIntegration(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await listIntegrations(accessToken, {
        storeId: selectedStoreId,
        type,
      });
      const current = response.data[0] ?? null;
      setIntegration(current);
      setConnectionDraft({
        externalAccountId: current?.externalAccountId ?? "",
        externalAccountName: current?.externalAccountName ?? "",
      });
    } catch (caught) {
      setError(messageFor(caught));
      setIntegration(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, canViewSelectedIntegration, selectedStoreId, type]);

  useEffect(() => {
    void loadIntegration();
  }, [loadIntegration]);

  async function saveConnection() {
    if (!accessToken || !selectedStoreId || !canManageSelectedIntegration) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (type === "SHOPIFY") {
        const response = await startShopifyOauth(accessToken, {
          storeId: selectedStoreId,
          shop: connectionDraft.externalAccountId,
        });
        window.location.assign(response.authorizationUrl);
        return;
      }
      const saved = await connectIntegration(accessToken, {
        storeId: selectedStoreId,
        type,
        externalAccountId: connectionDraft.externalAccountId || null,
        externalAccountName: connectionDraft.externalAccountName || null,
      });
      setIntegration(saved);
      setConnectOpen(false);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  async function syncShopify() {
    if (!accessToken || !integration || type !== "SHOPIFY") {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await syncShopifyCatalog(accessToken, integration.id);
      await loadIntegration();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  async function createCredential() {
    if (!accessToken || !integration || !canManageSelectedIntegration) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await createIntegrationCredential(
        accessToken,
        integration.id,
        credentialDraft,
      );
      setIntegration((current) =>
        current
          ? {
              ...current,
              credentials: [response.credential, ...current.credentials],
            }
          : current,
      );
      setCreatedSecret({
        name: response.credential.name,
        secret: response.secret,
      });
      setSecretCopied(false);
      setCredentialDraft({
        name: `${title} plugin`,
        scopes: defaultCredentialScopes,
      });
      setCredentialOpen(false);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  async function revokeCredential(credentialId: string) {
    if (!accessToken || !canManageSelectedIntegration) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const revoked = await revokeIntegrationCredential(
        accessToken,
        credentialId,
      );
      setIntegration((current) =>
        current
          ? {
              ...current,
              credentials: current.credentials.map((credential) =>
                credential.id === revoked.id ? revoked : credential,
              ),
            }
          : current,
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  async function disconnectCurrentIntegration() {
    if (!accessToken || !integration || !canManageSelectedIntegration) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      setIntegration(await disconnectIntegration(accessToken, integration.id));
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

  function toggleScope(scope: IntegrationCredentialScope) {
    setCredentialDraft((current) => {
      const selected = current.scopes.includes(scope);
      return {
        ...current,
        scopes: selected
          ? current.scopes.filter((entry) => entry !== scope)
          : [...current.scopes, scope],
      };
    });
  }

  const connected = Boolean(
    integration && integration.status !== "DISCONNECTED",
  );

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Integrations"
        title={title}
        description={`${title} connects through a Store-scoped SelfX integration credential.`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={() => void loadIntegration()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            <Button
              disabled={!selectedStoreId || !canManageSelectedIntegration}
              onClick={() => setConnectOpen(true)}
            >
              <LinkIcon aria-hidden="true" />
              {type === "SHOPIFY"
                ? connected
                  ? "Reconnect Shopify"
                  : "Connect Shopify"
                : connected
                  ? "Edit Connection"
                  : "Register Connection"}
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
            title="Store"
            description="Integration ownership is resolved from the active SelfX Store."
          >
            <div className="space-y-4">
              <label className="space-y-2 text-sm">
                <span className="font-medium">Store</span>
                <SelectMenu
                  ariaLabel="Store"
                  value={selectedStoreId}
                  options={storeOptions.map((store) => ({
                    value: store.id,
                    label: store.name,
                  }))}
                  onChange={setSelectedStoreId}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <SummaryTile
                  label="Status"
                  value={integration?.status ?? "NOT CONNECTED"}
                />
                <SummaryTile
                  label="Active Tokens"
                  value={String(activeCredentials)}
                />
              </div>
              <div className="rounded-lg border bg-muted/25 p-3 text-xs leading-5 text-muted-foreground">
                The plugin token belongs only to this Store and this
                integration. If it is leaked or no longer used, revoke it here.
              </div>
            </div>
          </TableContainer>

          <TableContainer
            title="Connection"
            description={
              type === "SHOPIFY"
                ? "Shopify authorizes read-only catalog access."
                : "External store identity and connection status."
            }
            actions={
              connected && canManageSelectedIntegration ? (
                <div className="flex items-center gap-2">
                  {type === "SHOPIFY" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={saving}
                      onClick={() => void syncShopify()}
                    >
                      <RefreshCwIcon aria-hidden="true" />
                      Sync Catalog
                    </Button>
                  ) : null}
                  <ConfirmDialog
                    title={`Disconnect ${title}?`}
                    description="Disconnecting revokes active plugin credentials for this integration."
                    confirmLabel="Disconnect"
                    destructive
                    onConfirm={() => void disconnectCurrentIntegration()}
                    trigger={
                      <Button variant="outline" size="sm" disabled={saving}>
                        <UnplugIcon aria-hidden="true" />
                        Disconnect
                      </Button>
                    }
                  />
                </div>
              ) : null
            }
          >
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">
                Loading integration...
              </div>
            ) : integration ? (
              <div className="grid gap-4 p-1 sm:grid-cols-2">
                <Detail label="Store" value={integration.storeName} />
                <Detail
                  label="Status"
                  value={<StatusBadge status={integration.status} />}
                />
                <Detail
                  label="External ID"
                  value={integration.externalAccountId || "Not set"}
                />
                <Detail
                  label="External name"
                  value={integration.externalAccountName || "Not set"}
                />
                <Detail
                  label="Connected"
                  value={formatDateTime(integration.connectedAt)}
                />
                <Detail
                  label="Updated"
                  value={formatDateTime(integration.updatedAt)}
                />
              </div>
            ) : (
              <div className="p-4 text-sm text-muted-foreground">
                Register the Store connection before creating plugin
                credentials.
              </div>
            )}
          </TableContainer>
        </div>
      </PageSection>

      <PageSection>
        <TableContainer
          title="Plugin Credentials"
          description="Tokens are shown once and stored by SelfX only as hashes."
          actions={
            <Button
              size="sm"
              disabled={!connected || !canManageSelectedIntegration || saving}
              onClick={() => setCredentialOpen(true)}
            >
              <PlusIcon aria-hidden="true" />
              Create Token
            </Button>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6}>Loading credentials...</TableCell>
                </TableRow>
              ) : !integration?.credentials.length ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    No plugin credentials have been created yet.
                  </TableCell>
                </TableRow>
              ) : (
                integration.credentials.map((credential) => (
                  <CredentialRow
                    key={credential.id}
                    credential={credential}
                    canManage={canManageSelectedIntegration}
                    saving={saving}
                    onRevoke={revokeCredential}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </PageSection>

      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {type === "SHOPIFY" ? "Connect Shopify" : `Register ${title}`}
            </DialogTitle>
            <DialogDescription>
              {type === "SHOPIFY"
                ? `Authorize read-only product access for ${selectedStoreName}.`
                : `Record the external store identity for ${selectedStoreName}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="space-y-2 text-sm">
              <span>
                {type === "SHOPIFY" ? "Shop domain" : "External store ID"}
              </span>
              <Input
                value={connectionDraft.externalAccountId}
                maxLength={180}
                placeholder={
                  type === "SHOPIFY"
                    ? "my-shop.myshopify.com"
                    : "https://store.example.com"
                }
                onChange={(event) =>
                  setConnectionDraft((current) => ({
                    ...current,
                    externalAccountId: event.target.value,
                  }))
                }
              />
            </label>
            {type !== "SHOPIFY" ? (
              <label className="space-y-2 text-sm">
                <span>External store name</span>
                <Input
                  value={connectionDraft.externalAccountName}
                  maxLength={240}
                  placeholder={selectedStoreName || title}
                  onChange={(event) =>
                    setConnectionDraft((current) => ({
                      ...current,
                      externalAccountName: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                saving ||
                !selectedStoreId ||
                (type === "SHOPIFY" && !connectionDraft.externalAccountId)
              }
              onClick={saveConnection}
            >
              <LinkIcon aria-hidden="true" />
              {type === "SHOPIFY" ? "Continue to Shopify" : "Save Connection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={credentialOpen} onOpenChange={setCredentialOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Plugin Token</DialogTitle>
            <DialogDescription>
              Create a scoped token for the {title} plugin. The secret is shown
              only once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="space-y-2 text-sm">
              <span>Name</span>
              <Input
                value={credentialDraft.name}
                maxLength={120}
                onChange={(event) =>
                  setCredentialDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <div className="space-y-2 text-sm">
              <Label>Scopes</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {credentialScopes.map((scope) => (
                  <label
                    key={scope.value}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-3"
                  >
                    <input
                      type="checkbox"
                      checked={credentialDraft.scopes.includes(scope.value)}
                      onChange={() => toggleScope(scope.value)}
                      className="size-4"
                    />
                    <span className="font-medium">{scope.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredentialOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                saving ||
                !credentialDraft.name.trim() ||
                credentialDraft.scopes.length < 1
              }
              onClick={createCredential}
            >
              <PlusIcon aria-hidden="true" />
              Create Token
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
            <DialogTitle>Copy Plugin Token</DialogTitle>
            <DialogDescription>
              This token for {createdSecret?.name} is shown only once.
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
              {secretCopied ? "Copied" : "Copy Token"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function CredentialRow({
  credential,
  canManage,
  saving,
  onRevoke,
}: {
  credential: IntegrationCredential;
  canManage: boolean;
  saving: boolean;
  onRevoke: (credentialId: string) => Promise<void>;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{credential.name}</div>
        <div className="text-xs text-muted-foreground">
          Created by {credential.createdByEmail}
        </div>
      </TableCell>
      <TableCell>
        <code className="text-xs">{credential.tokenPrefix}</code>
      </TableCell>
      <TableCell>
        <div className="flex max-w-80 flex-wrap gap-1.5">
          {credential.scopes.map((scope) => (
            <Badge key={scope} variant="secondary">
              {formatScope(scope)}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDateTime(credential.lastUsedAt)}
      </TableCell>
      <TableCell>
        <StatusBadge status={credential.status} />
      </TableCell>
      <TableCell className="text-right">
        {credential.status === "ACTIVE" && canManage ? (
          <ConfirmDialog
            title="Revoke plugin token?"
            description={`Revoke ${credential.name}? The external plugin will stop using this token.`}
            confirmLabel="Revoke"
            destructive
            onConfirm={() => onRevoke(credential.id)}
            trigger={
              <Button variant="outline" size="sm" disabled={saving}>
                <Trash2Icon aria-hidden="true" />
                Revoke
              </Button>
            }
          />
        ) : (
          <span className="text-xs text-muted-foreground">
            {credential.status === "ACTIVE" ? "View only" : "Revoked"}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold">{value}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
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

function formatScope(scope: IntegrationCredentialScope): string {
  return (
    credentialScopes.find((option) => option.value === scope)?.label ?? scope
  );
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  return "Integration settings could not be loaded.";
}
