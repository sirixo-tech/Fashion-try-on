"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3Icon,
  CheckCircleIcon,
  CopyIcon,
  KeyRoundIcon,
  LinkIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  Trash2Icon,
  WebhookIcon,
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
  createDeveloperApiKey,
  createDeveloperApiWebhook,
  disableDeveloperApiWebhook,
  getDeveloperApiUsageSummary,
  listDeveloperApiKeys,
  listDeveloperApiWebhookDeliveries,
  listDeveloperApiWebhooks,
  revokeDeveloperApiKey,
  updateDeveloperApiWebhook,
  type DeveloperApiCatalogSource,
  type DeveloperApiKey,
  type DeveloperApiKeyEnvironment,
  type DeveloperApiKeyScope,
  type DeveloperApiUsageRangePreset,
  type DeveloperApiUsageSummary,
  type DeveloperApiWebhookDelivery,
  type DeveloperApiWebhookEndpoint,
  type DeveloperApiWebhookEvent,
} from "@/lib/developer-api";
import { listActiveOrganizations } from "@/lib/organizations";
import { useSession } from "@/lib/session";
import {
  getEffectiveStorePermissions,
  listStores,
  type AdminStore,
  type EffectiveStorePermissions,
} from "@/lib/stores";

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

const webhookEvents: Array<{
  value: DeveloperApiWebhookEvent;
  label: string;
}> = [
  { value: "try_on.completed", label: "Try-On completed" },
  { value: "try_on.failed", label: "Try-On failed" },
];

const catalogSources: Array<{
  value: DeveloperApiCatalogSource;
  label: string;
}> = [
  { value: "SELFX_CATALOG", label: "SelfX catalog" },
  { value: "STORE_CATALOG", label: "Store catalog" },
  { value: "SHOPIFY", label: "Shopify" },
  { value: "WOOCOMMERCE", label: "WooCommerce" },
  { value: "CUSTOM_API", label: "Custom API" },
  { value: "PUBLIC_API", label: "Public API" },
];

type StoreOption = { id: string; name: string };

type CreateKeyDraft = {
  name: string;
  environment: DeveloperApiKeyEnvironment;
  scopes: DeveloperApiKeyScope[];
};

type WebhookDraft = {
  id: string | null;
  url: string;
  subscribedEvents: DeveloperApiWebhookEvent[];
  enabled: boolean;
};

const defaultCreateDraft: CreateKeyDraft = {
  name: "",
  environment: "TEST",
  scopes: ["tryon:create", "tryon:read"],
};

const defaultWebhookDraft: WebhookDraft = {
  id: null,
  url: "",
  subscribedEvents: ["try_on.completed", "try_on.failed"],
  enabled: true,
};

export default function DeveloperPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [platformAccess, setPlatformAccess] =
    useState<CurrentPlatformAccess | null>(null);
  const [selectedStoreAccess, setSelectedStoreAccess] =
    useState<EffectiveStorePermissions | null>(null);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [keys, setKeys] = useState<DeveloperApiKey[]>([]);
  const [usage, setUsage] = useState<DeveloperApiUsageSummary | null>(null);
  const [usageRange, setUsageRange] =
    useState<DeveloperApiUsageRangePreset>("7d");
  const [usageCatalogSource, setUsageCatalogSource] = useState<
    DeveloperApiCatalogSource | ""
  >("");
  const [usageProductQuery, setUsageProductQuery] = useState("");
  const [webhooks, setWebhooks] = useState<DeveloperApiWebhookEndpoint[]>([]);
  const [deliveries, setDeliveries] = useState<DeveloperApiWebhookDelivery[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [loadingConsole, setLoadingConsole] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [draft, setDraft] = useState<CreateKeyDraft>(defaultCreateDraft);
  const [webhookDraft, setWebhookDraft] =
    useState<WebhookDraft>(defaultWebhookDraft);
  const [createdSecret, setCreatedSecret] = useState<{
    name: string;
    secret: string;
  } | null>(null);
  const [webhookSecret, setWebhookSecret] = useState<{
    url: string;
    secret: string;
  } | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [webhookSecretCopied, setWebhookSecretCopied] = useState(false);
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
      selectedStoreAccess?.platformBypass ||
      selectedStoreAccess?.permissions.includes("developer_api.manage"),
  );
  const canViewSelectedDeveloperApi = Boolean(
    hasPlatformDeveloperAccess ||
      selectedStoreAccess?.platformBypass ||
      selectedStoreAccess?.permissions.includes("developer_api.view") ||
      selectedStoreAccess?.permissions.includes("developer_api.manage"),
  );
  const selectedStoreName =
    storeOptions.find((store) => store.id === selectedStoreId)?.name ?? "";
  const canCreate =
    Boolean(selectedStoreId) && canManageSelectedDeveloperApi && !saving;
  const canManageWebhookForSelection =
    Boolean(selectedStoreId) && canManageSelectedDeveloperApi;

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

  const loadKeys = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    if (!hasPlatformDeveloperAccess && (!selectedStoreId || !canViewSelectedDeveloperApi)) {
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
  }, [
    accessToken,
    canViewSelectedDeveloperApi,
    hasPlatformDeveloperAccess,
    selectedStoreId,
  ]);

  const loadConsole = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    if (!hasPlatformDeveloperAccess && (!selectedStoreId || !canViewSelectedDeveloperApi)) {
      setUsage(null);
      setWebhooks([]);
      setDeliveries([]);
      setLoadingConsole(false);
      return;
    }
    setLoadingConsole(true);
    setError(null);
    try {
      const storeId = selectedStoreId || undefined;
      const [usageResponse, webhookResponse, deliveryResponse] =
        await Promise.all([
          getDeveloperApiUsageSummary(accessToken, {
            storeId,
            range: usageRange,
            limit: 8,
            catalogSource: usageCatalogSource || undefined,
            productQuery: usageProductQuery.trim() || undefined,
          }),
          listDeveloperApiWebhooks(accessToken, { storeId }),
          listDeveloperApiWebhookDeliveries(accessToken, {
            storeId,
            limit: 20,
          }),
        ]);
      setUsage(usageResponse);
      setWebhooks(webhookResponse.data);
      setDeliveries(deliveryResponse.data);
    } catch (caught) {
      setError(messageFor(caught));
      setUsage(null);
      setWebhooks([]);
      setDeliveries([]);
    } finally {
      setLoadingConsole(false);
    }
  }, [
    accessToken,
    canViewSelectedDeveloperApi,
    hasPlatformDeveloperAccess,
    selectedStoreId,
    usageCatalogSource,
    usageProductQuery,
    usageRange,
  ]);

  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  useEffect(() => {
    void loadConsole();
  }, [loadConsole]);

  const activeKeys = useMemo(
    () => keys.filter((key) => key.status === "ACTIVE").length,
    [keys],
  );

  async function refreshAll() {
    await Promise.all([loadKeys(), loadConsole()]);
  }

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

  async function saveWebhook() {
    if (!accessToken || !canManageWebhookForSelection) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (webhookDraft.id) {
        const updated = await updateDeveloperApiWebhook(
          accessToken,
          webhookDraft.id,
          {
            url: webhookDraft.url,
            subscribedEvents: webhookDraft.subscribedEvents,
            enabled: webhookDraft.enabled,
          },
        );
        setWebhooks((current) =>
          current.map((endpoint) =>
            endpoint.id === updated.id ? updated : endpoint,
          ),
        );
      } else {
        const created = await createDeveloperApiWebhook(accessToken, {
          storeId: selectedStoreId,
          url: webhookDraft.url,
          subscribedEvents: webhookDraft.subscribedEvents,
        });
        setWebhooks((current) => [created, ...current]);
        setWebhookSecret({ url: created.url, secret: created.secret });
        setWebhookSecretCopied(false);
      }
      setWebhookDraft(defaultWebhookDraft);
      setWebhookOpen(false);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  async function setWebhookEnabled(
    endpoint: DeveloperApiWebhookEndpoint,
    enabled: boolean,
  ) {
    if (!accessToken || !canManageSelectedDeveloperApi) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = enabled
        ? await updateDeveloperApiWebhook(accessToken, endpoint.id, {
            enabled: true,
          })
        : await disableDeveloperApiWebhook(accessToken, endpoint.id).then(
            () => ({ ...endpoint, status: "DISABLED" as const }),
          );
      setWebhooks((current) =>
        current.map((item) => (item.id === endpoint.id ? updated : item)),
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

  async function copyWebhookSecret() {
    if (!webhookSecret) {
      return;
    }
    await navigator.clipboard.writeText(webhookSecret.secret);
    setWebhookSecretCopied(true);
  }

  function openWebhookDialog(endpoint?: DeveloperApiWebhookEndpoint) {
    setWebhookDraft(
      endpoint
        ? {
            id: endpoint.id,
            url: endpoint.url,
            subscribedEvents: endpoint.subscribedEvents,
            enabled: endpoint.status === "ACTIVE",
          }
        : defaultWebhookDraft,
    );
    setWebhookOpen(true);
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

  function toggleWebhookEvent(event: DeveloperApiWebhookEvent) {
    setWebhookDraft((current) => {
      const selected = current.subscribedEvents.includes(event);
      const subscribedEvents = selected
        ? current.subscribedEvents.filter((entry) => entry !== event)
        : [...current.subscribedEvents, event];
      return { ...current, subscribedEvents };
    });
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Developer"
        title="Developer / API"
        description="Create Store API keys, track Public API activity and manage webhook endpoints from one console."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={() => void refreshAll()}>
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
            description="Keys, usage and webhooks are owned by Store tenants."
          >
            <div className="space-y-4">
              <label className="space-y-2 text-sm">
                <span className="font-medium">Store</span>
                <SelectMenu
                  ariaLabel="Store"
                  value={selectedStoreId}
                  options={[
                    ...(hasPlatformDeveloperAccess
                      ? [{ value: "", label: "All Stores" }]
                      : []),
                    ...storeOptions.map((store) => ({
                      value: store.id,
                      label: store.name,
                    })),
                  ]}
                  onChange={setSelectedStoreId}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium">Usage range</span>
                <SelectMenu
                  ariaLabel="Usage range"
                  value={usageRange}
                  options={[
                    { value: "today", label: "Today" },
                    { value: "7d", label: "Last 7 days" },
                    { value: "30d", label: "Last 30 days" },
                    { value: "90d", label: "Last 90 days" },
                  ]}
                  onChange={setUsageRange}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium">Catalog source</span>
                <SelectMenu
                  ariaLabel="Catalog source"
                  value={usageCatalogSource}
                  options={[
                    { value: "", label: "All sources" },
                    ...catalogSources,
                  ]}
                  onChange={setUsageCatalogSource}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium">Product search</span>
                <Input
                  value={usageProductQuery}
                  onChange={(event) => setUsageProductQuery(event.target.value)}
                  placeholder="Name, SKU or external ID"
                />
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
            title="Public API Usage"
            description={
              usage
                ? `${formatDateTime(usage.range.from)} to ${formatDateTime(
                    usage.range.to,
                  )}`
                : "Track external Try-On activity and downloads."
            }
          >
            {loadingConsole ? (
              <div className="text-sm text-muted-foreground">
                Loading usage...
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <SummaryTile
                    label="Runs"
                    value={usage?.totals.runsCreated ?? 0}
                  />
                  <SummaryTile
                    label="Completed"
                    value={usage?.totals.completedRuns ?? 0}
                  />
                  <SummaryTile
                    label="Processing"
                    value={usage?.totals.processingRuns ?? 0}
                  />
                  <SummaryTile
                    label="Failed"
                    value={usage?.totals.failedRuns ?? 0}
                  />
                  <SummaryTile
                    label="Generated"
                    value={usage?.totals.generatedLooks ?? 0}
                  />
                  <SummaryTile
                    label="Downloads"
                    value={usage?.totals.downloadsCompleted ?? 0}
                  />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Runs</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Failed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usage?.providerUsage.length ? (
                      usage.providerUsage.map((row) => (
                        <TableRow
                          key={`${row.provider}:${row.providerModel ?? ""}`}
                        >
                          <TableCell className="font-medium">
                            {row.provider}
                          </TableCell>
                          <TableCell>
                            {row.providerModel ?? "Default"}
                          </TableCell>
                          <TableCell>{row.runsCreated}</TableCell>
                          <TableCell>{row.completedRuns}</TableCell>
                          <TableCell>{row.failedRuns}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5}>
                          No provider activity for this range.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Catalog Sources</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Source</TableHead>
                          <TableHead>Runs</TableHead>
                          <TableHead>Generated</TableHead>
                          <TableHead>Downloads</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usage?.catalogSourceUsage.length ? (
                          usage.catalogSourceUsage.map((row) => (
                            <TableRow key={row.catalogSource ?? "UNSPECIFIED"}>
                              <TableCell className="font-medium">
                                {formatCatalogSource(row.catalogSource)}
                              </TableCell>
                              <TableCell>{row.runsCreated}</TableCell>
                              <TableCell>{row.generatedLooks}</TableCell>
                              <TableCell>{row.downloadsCompleted}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4}>
                              No catalog source activity for this range.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">
                      Product References
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Runs</TableHead>
                          <TableHead>Downloads</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usage?.productUsage.length ? (
                          usage.productUsage.map((row) => (
                            <TableRow
                              key={`${row.selfxProductId ?? ""}:${
                                row.externalProductId ?? ""
                              }:${row.externalVariantId ?? ""}:${
                                row.sku ?? ""
                              }:${row.productName ?? ""}`}
                            >
                              <TableCell>
                                <div className="font-medium">
                                  {formatProductReference(row)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {formatProductSubtext(row)}
                                </div>
                              </TableCell>
                              <TableCell>
                                {formatCatalogSource(row.catalogSource ?? null)}
                              </TableCell>
                              <TableCell>{row.runsCreated}</TableCell>
                              <TableCell>{row.downloadsCompleted}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4}>
                              No product references for this range.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </TableContainer>
        </div>
      </PageSection>

      <PageSection>
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
      </PageSection>

      <PageSection>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(24rem,0.9fr)]">
          <TableContainer
            title="Webhooks"
            description="Send signed events when Public API Try-On runs complete or fail."
            actions={
              <Button
                size="sm"
                disabled={!canManageWebhookForSelection || saving}
                onClick={() => openWebhookDialog()}
                title={
                  selectedStoreId
                    ? undefined
                    : "Choose one Store before creating a webhook."
                }
              >
                <WebhookIcon aria-hidden="true" />
                Add Webhook
              </Button>
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Latest Delivery</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingConsole ? (
                  <TableRow>
                    <TableCell colSpan={5}>Loading webhooks...</TableCell>
                  </TableRow>
                ) : webhooks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      No webhook endpoints have been configured yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  webhooks.map((endpoint) => (
                    <TableRow key={endpoint.id}>
                      <TableCell>
                        <div className="max-w-lg truncate font-medium">
                          {endpoint.url}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {endpoint.storeName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-72 flex-wrap gap-1.5">
                          {endpoint.subscribedEvents.map((event) => (
                            <Badge key={event} variant="secondary">
                              {formatWebhookEvent(event)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {endpoint.latestDelivery
                          ? `${endpoint.latestDelivery.status.toLowerCase()} at ${formatDateTime(
                              endpoint.latestDelivery.createdAt,
                            )}`
                          : "No deliveries yet"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={endpoint.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {canManageSelectedDeveloperApi ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={saving}
                              onClick={() => openWebhookDialog(endpoint)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={saving}
                              onClick={() =>
                                void setWebhookEnabled(
                                  endpoint,
                                  endpoint.status !== "ACTIVE",
                                )
                              }
                            >
                              {endpoint.status === "ACTIVE"
                                ? "Disable"
                                : "Enable"}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            View only
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TableContainer
            title="Recent Deliveries"
            description="Latest webhook attempts for the selected context."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingConsole ? (
                  <TableRow>
                    <TableCell colSpan={3}>Loading deliveries...</TableCell>
                  </TableRow>
                ) : deliveries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3}>No deliveries yet.</TableCell>
                  </TableRow>
                ) : (
                  deliveries.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell>
                        <div className="font-medium">
                          {formatWebhookEvent(delivery.eventType)}
                        </div>
                        <div className="max-w-56 truncate text-xs text-muted-foreground">
                          {delivery.endpointUrl}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {delivery.status.toLowerCase()}
                          {delivery.httpStatus ? ` ${delivery.httpStatus}` : ""}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(delivery.createdAt)}
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

      <Dialog open={webhookOpen} onOpenChange={setWebhookOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {webhookDraft.id ? "Edit Webhook" : "Add Webhook"}
            </DialogTitle>
            <DialogDescription>
              SelfX will send signed HTTPS events for{" "}
              {selectedStoreName || "this Store"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="space-y-2 text-sm">
              <span>Endpoint URL</span>
              <Input
                value={webhookDraft.url}
                maxLength={2048}
                placeholder="https://example.com/selfx/webhooks"
                onChange={(event) =>
                  setWebhookDraft((current) => ({
                    ...current,
                    url: event.target.value,
                  }))
                }
              />
            </label>
            <div className="space-y-2 text-sm">
              <Label>Events</Label>
              <div className="grid gap-2">
                {webhookEvents.map((event) => (
                  <label
                    key={event.value}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-3"
                  >
                    <input
                      type="checkbox"
                      checked={webhookDraft.subscribedEvents.includes(
                        event.value,
                      )}
                      onChange={() => toggleWebhookEvent(event.value)}
                      className="size-4"
                    />
                    <span className="font-medium">{event.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {webhookDraft.id ? (
              <label className="flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm">
                <span>
                  <span className="block font-medium">Endpoint active</span>
                  <span className="block text-xs text-muted-foreground">
                    Disabled endpoints keep their history but receive no events.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={webhookDraft.enabled}
                  onChange={(event) =>
                    setWebhookDraft((current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))
                  }
                  className="size-4"
                />
              </label>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setWebhookDraft(defaultWebhookDraft);
                setWebhookOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={
                saving ||
                !webhookDraft.url.trim() ||
                webhookDraft.subscribedEvents.length < 1
              }
              onClick={() => void saveWebhook()}
            >
              <LinkIcon aria-hidden="true" />
              {webhookDraft.id ? "Save Webhook" : "Add Webhook"}
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

      <Dialog
        open={Boolean(webhookSecret)}
        onOpenChange={(open) => {
          if (!open) {
            setWebhookSecret(null);
            setWebhookSecretCopied(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy Webhook Secret</DialogTitle>
            <DialogDescription>
              This signing secret for {webhookSecret?.url} is shown only once.
              Use it to verify SelfX webhook signatures.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-3">
            <code className="block break-all text-sm">
              {webhookSecret?.secret}
            </code>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWebhookSecret(null)}>
              Done
            </Button>
            <Button onClick={() => void copyWebhookSecret()}>
              {webhookSecretCopied ? (
                <CheckCircleIcon aria-hidden="true" />
              ) : (
                <CopyIcon aria-hidden="true" />
              )}
              {webhookSecretCopied ? "Copied" : "Copy Secret"}
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
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <BarChart3Icon size={14} aria-hidden="true" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function storeOptionFromAdminStore(store: AdminStore): StoreOption {
  return { id: store.id, name: store.name };
}

function formatWebhookEvent(value: string): string {
  if (value === "try_on.completed") {
    return "Completed";
  }
  if (value === "try_on.failed") {
    return "Failed";
  }
  return value;
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

function formatCatalogSource(value: DeveloperApiCatalogSource | null): string {
  return (
    catalogSources.find((source) => source.value === value)?.label ??
    "Unspecified"
  );
}

function formatProductReference(
  row: NonNullable<DeveloperApiUsageSummary["productUsage"][number]>,
): string {
  return (
    row.productName ??
    row.sku ??
    row.externalVariantId ??
    row.externalProductId ??
    row.selfxProductId ??
    "Product reference"
  );
}

function formatProductSubtext(
  row: NonNullable<DeveloperApiUsageSummary["productUsage"][number]>,
): string {
  const parts = [
    row.sku ? `SKU ${row.sku}` : null,
    row.externalVariantId ??
      row.externalProductId ??
      row.selfxProductId ??
      null,
    row.price && row.currency ? `${row.currency} ${row.price}` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "No additional reference";
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  return "Developer API settings could not be loaded.";
}
