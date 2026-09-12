"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIcon,
  AlertTriangleIcon,
  ArrowLeftIcon,
  BarChart3Icon,
  Clock3Icon,
  CoinsIcon,
  CreditCardIcon,
  GlobeIcon,
  ImageIcon,
  HistoryIcon,
  MailIcon,
  MapPinIcon,
  MonitorIcon,
  PackageIcon,
  PhoneIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  ShieldAlertIcon,
  Trash2Icon,
  UploadIcon,
  VideoIcon,
} from "lucide-react";

import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
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

import { SafeApiError } from "@/lib/api";
import {
  getCurrentPlatformAccess,
  type CurrentPlatformAccess,
} from "@/lib/access-control";
import {
  type KioskConfiguration,
  type KioskConfigurationAssetType,
  type KioskConfigurationUpdateInput,
  type KioskDevice,
} from "@/lib/kiosks";
import { listPricingPlans, type PricingPlan } from "@/lib/pricing";
import { useSession } from "@/lib/session";
import {
  activateStore,
  assignStorePricingPlan,
  deactivateStore,
  getEffectiveStorePermissions,
  getStore,
  getStoreCreditDiagnostics,
  getStoreKioskConfiguration,
  getStoreVirtualTryOnSettings,
  pairStoreKiosk,
  createStoreKioskConfigurationAssetUploadIntent,
  topUpStoreCredits,
  updateStore,
  updateStoreKioskConfiguration,
  updateStoreVirtualTryOnSettings,
  type AdminStoreDetail,
  type StoreCreditDiagnostics,
  type StoreInput,
  type StoreTryOnCapability,
  type StoreVirtualTryOnSettings,
} from "@/lib/stores";

const lowCreditThreshold = 20;

export default function StoreDashboardPage() {
  const params = useParams<{ storeId: string }>();
  const storeId = params.storeId;
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [store, setStore] = useState<AdminStoreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeTryOnSettings, setStoreTryOnSettings] =
    useState<StoreVirtualTryOnSettings | null>(null);
  const [effectivePermissions, setEffectivePermissions] = useState<string[]>(
    [],
  );
  const [platformBypass, setPlatformBypass] = useState(false);
  const [canManagePricing, setCanManagePricing] = useState(false);
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [assigningPlan, setAssigningPlan] = useState(false);
  const [creditDiagnostics, setCreditDiagnostics] =
    useState<StoreCreditDiagnostics | null>(null);
  const [topUpQuantity, setTopUpQuantity] = useState("100");
  const [topUpReason, setTopUpReason] = useState("Manual admin top-up");
  const [toppingUpCredits, setToppingUpCredits] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [savingStoreTryOnSettings, setSavingStoreTryOnSettings] =
    useState(false);
  const [configurationDevice, setConfigurationDevice] =
    useState<KioskDevice | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [
        nextStore,
        nextEffectivePermissions,
        nextStoreTryOnSettings,
        nextPlatformAccess,
      ] =
        await Promise.all([
          getStore(accessToken, storeId),
          getEffectiveStorePermissions(accessToken, storeId),
          getStoreVirtualTryOnSettings(accessToken, storeId),
          getCurrentPlatformAccess(accessToken).catch(
            (): CurrentPlatformAccess => ({
            isSuperadmin: false,
            permissions: [],
            }),
          ),
        ]);
      const nextEffectivePermissionCodes = nextEffectivePermissions.permissions;
      const nextCanManagePricing =
        nextPlatformAccess.isSuperadmin ||
        nextPlatformAccess.permissions.includes("PRICING_MANAGE");
      setStore(nextStore);
      setStoreTryOnSettings(nextStoreTryOnSettings);
      setEffectivePermissions(nextEffectivePermissionCodes);
      setPlatformBypass(nextEffectivePermissions.platformBypass);
      setCanManagePricing(nextCanManagePricing);
      setSelectedPlanId(
        nextStore.subscription?.subscription?.pricingPlan?.id ?? "",
      );
      setPricingPlans(
        nextCanManagePricing
          ? await listPricingPlans(accessToken).catch(() => [])
          : [],
      );
      setCreditDiagnostics(
        await getStoreCreditDiagnostics(accessToken, storeId).catch(() => null),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const kiosks = store?.kiosks.data ?? [];
  const can = useCallback(
    (permission: string) => effectivePermissions.includes(permission),
    [effectivePermissions],
  );
  const canPairKiosks = can("kiosks.pair");
  const canConfigureKiosks = can("kiosks.configure");
  const canUpdateStore = can("stores.update");
  const currentPricingPlan = store?.subscription?.subscription?.pricingPlan;
  const availableCredits = store?.subscription?.availableCredits ?? null;
  const creditHealth = creditHealthFor(availableCredits);
  const location = store ? storeLocation(store) : "";
  const activeKioskShare =
    store && store.totalKiosks > 0
      ? Math.round((store.activeKiosks / store.totalKiosks) * 100)
      : 0;
  const garmentPreviewControlDisabled =
    !canUpdateStore ||
    savingStoreTryOnSettings ||
    !storeTryOnSettings?.garmentTryOnEnabled ||
    !storeTryOnSettings?.platformGarmentPreviewEnabled ||
    !storeTryOnSettings.storeHasGarmentPreviewPermission;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Store Dashboard"
        title={store?.name ?? "Store"}
        description={
          store
            ? location || "Store operations and kiosk runtime settings."
            : "Store operations and kiosk runtime settings."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button render={<Link href="/app/stores" />} variant="outline">
              <ArrowLeftIcon aria-hidden="true" />
              Stores
            </Button>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            <Button
              render={<Link href={`/app/stores/${storeId}/products`} />}
              variant="outline"
            >
              <PackageIcon aria-hidden="true" />
              Products
            </Button>
            <Button
              onClick={() => setPairOpen(true)}
              disabled={!store || !canPairKiosks}
            >
              <PlusIcon aria-hidden="true" />
              Pair Kiosk
            </Button>
          </div>
        }
        status={
          store ? (
            <StatusBadge status={store.status} label={store.status} />
          ) : null
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Total Kiosks"
            value={store?.totalKiosks ?? 0}
            icon={<MonitorIcon size={18} aria-hidden="true" />}
            caption="Paired devices"
          />
          <MetricCard
            label="Active Kiosks"
            value={store?.activeKiosks ?? 0}
            icon={<ActivityIcon size={18} aria-hidden="true" />}
            caption={`${activeKioskShare}% fleet active`}
          />
          <MetricCard
            label="Last Activity"
            value={formatDate(store?.lastActivityAt ?? null)}
            icon={<Clock3Icon size={18} aria-hidden="true" />}
            caption="Most recent kiosk signal"
          />
          <MetricCard
            label="Try-On Credits"
            value={availableCredits ?? 0}
            icon={<CoinsIcon size={18} aria-hidden="true" />}
            caption={creditStatusCaption(creditHealth, currentPricingPlan?.name)}
          />
          <MetricCard
            label="Configuration"
            value={kiosks.length}
            icon={<SettingsIcon size={18} aria-hidden="true" />}
            caption="Kiosks ready to manage"
          />
        </div>
      </PageSection>

      <PageSection>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg border bg-muted/35 p-2 text-primary">
                  <CreditCardIcon size={18} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Credits and plan</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Store-wide credits are shared by Shopify, kiosks and public
                    Try-On channels.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <PlanInfoTile
                  label="Available credits"
                  value={String(availableCredits ?? 0)}
                />
                <PlanInfoTile
                  label="Current plan"
                  value={currentPricingPlan?.name ?? "Trial"}
                />
                <PlanInfoTile
                  label="Period ends"
                  value={formatDate(
                    store?.subscription?.subscription?.currentPeriodEnd ?? null,
                  )}
                />
              </div>
            </div>

            {canManagePricing ? (
              <div className="grid w-full max-w-2xl gap-4 md:grid-cols-2">
                <div
                  id="manual-credit-top-up"
                  className="space-y-3 rounded-lg border bg-muted/25 p-4"
                >
                  <label className="block text-sm font-medium" htmlFor="planId">
                    Assign pricing plan
                  </label>
                  <select
                    id="planId"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={selectedPlanId}
                    onChange={(event) => setSelectedPlanId(event.target.value)}
                  >
                    <option value="">Select plan</option>
                    {pricingPlans
                      .filter((plan) => plan.status === "ACTIVE")
                      .map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} - {plan.includedCredits} credits
                        </option>
                      ))}
                  </select>
                  <Button
                    onClick={() => void assignPricingPlan()}
                    disabled={!selectedPlanId || assigningPlan}
                  >
                    {assigningPlan ? "Assigning..." : "Assign plan"}
                  </Button>
                </div>
                <div className="space-y-3 rounded-lg border bg-muted/25 p-4">
                  <label
                    className="block text-sm font-medium"
                    htmlFor="creditTopUp"
                  >
                    Manual credit top-up
                  </label>
                  <Input
                    id="creditTopUp"
                    type="number"
                    min={1}
                    max={1_000_000}
                    value={topUpQuantity}
                    onChange={(event) => setTopUpQuantity(event.target.value)}
                  />
                  <Input
                    value={topUpReason}
                    onChange={(event) => setTopUpReason(event.target.value)}
                    placeholder="Reason"
                  />
                  <Button
                    onClick={() => void topUpCredits()}
                    disabled={toppingUpCredits}
                  >
                    {toppingUpCredits ? "Adding..." : "Add credits"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <CreditStatusNotice
            health={creditHealth}
            canManagePricing={canManagePricing}
          />

          {creditDiagnostics ? (
            <div className="mt-6 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <BarChart3Icon size={16} aria-hidden="true" />
                  Credit usage
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <PlanInfoTile
                    label="Consumed"
                    value={String(creditDiagnostics.totals.consumedCredits)}
                  />
                  <PlanInfoTile
                    label="Manual top-ups"
                    value={String(creditDiagnostics.totals.manualAdjustments)}
                  />
                </div>
                <div className="space-y-2">
                  {creditDiagnostics.byChannel.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      No Try-On credits consumed yet.
                    </div>
                  ) : (
                    creditDiagnostics.byChannel.map((row) => (
                      <div
                        key={row.channel}
                        className="flex items-center justify-between rounded-lg border p-3 text-sm"
                      >
                        <span className="font-medium">{row.channel}</span>
                        <span className="text-muted-foreground">
                          {row.consumedCredits} credits / {row.runs} runs
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold">
                    Most-used products
                  </div>
                  {creditDiagnostics.topProducts.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      Product usage appears after Try-On runs.
                    </div>
                  ) : (
                    creditDiagnostics.topProducts.map((product) => (
                      <div
                        key={product.productId}
                        className="flex items-center justify-between rounded-lg border p-3 text-sm"
                      >
                        <span className="font-medium">
                          {product.productName}
                        </span>
                        <span className="text-muted-foreground">
                          {product.consumedCredits} credits / {product.runs}{" "}
                          runs
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <HistoryIcon size={16} aria-hidden="true" />
                  Recent credit activity
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Credits</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creditDiagnostics.recentLedgerEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{formatLedgerType(entry.entryType)}</TableCell>
                        <TableCell>{entry.quantity}</TableCell>
                        <TableCell>{entry.reason ?? "-"}</TableCell>
                        <TableCell>{formatDate(entry.occurredAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </div>
      </PageSection>

      <PageSection>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.55fr)]">
          <TableContainer
            title="Store Kiosks"
            description="Kiosks assigned to this Store. Configuration remains attached to each kiosk device."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6}>Loading Store kiosks...</TableCell>
                  </TableRow>
                ) : kiosks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="flex items-center gap-3 py-8 text-muted-foreground">
                        <MonitorIcon size={20} aria-hidden="true" />
                        No kiosks are paired to this Store yet.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  kiosks.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell>
                        <div className="font-medium">{device.displayName}</div>
                        <div className="text-xs text-muted-foreground">
                          {device.id}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={device.status}
                          label={device.status}
                        />
                      </TableCell>
                      <TableCell>
                        {device.platform ?? "Unknown"}
                        {device.appVersion ? ` / ${device.appVersion}` : ""}
                      </TableCell>
                      <TableCell>
                        v{device.latestConfigurationVersion}
                      </TableCell>
                      <TableCell>{formatDate(device.lastSeenAt)}</TableCell>
                      <TableCell className="text-right">
                        {canConfigureKiosks ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfigurationDevice(device)}
                          >
                            <SettingsIcon aria-hidden="true" />
                            Manage
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            {store ? (
              <div className="space-y-5">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">Store Settings</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Store profile and runtime preferences.
                      </p>
                    </div>
                    <StatusBadge status={store.status} label={store.status} />
                  </div>
                </div>

                <div className="grid gap-3">
                  <StoreInfoRow
                    icon={<MapPinIcon size={16} aria-hidden="true" />}
                    label="Store URL"
                    value={`/${store.slug}`}
                  />
                  <StoreInfoRow
                    icon={<MailIcon size={16} aria-hidden="true" />}
                    label="Contact"
                    value={store.contactEmail ?? "-"}
                  />
                  <StoreInfoRow
                    icon={<PhoneIcon size={16} aria-hidden="true" />}
                    label="Phone"
                    value={store.contactPhone ?? "-"}
                  />
                  <StoreInfoRow
                    icon={<GlobeIcon size={16} aria-hidden="true" />}
                    label="Website"
                    value={store.website ?? "-"}
                  />
                  <StoreInfoRow
                    icon={<Clock3Icon size={16} aria-hidden="true" />}
                    label="Timezone"
                    value={store.timezone}
                  />
                </div>

                {storeTryOnSettings ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border bg-muted/25 p-4">
                      <div className="mb-3">
                        <div className="text-sm font-semibold">
                          Try-On Capabilities
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Choose which customer Try-On flows this Store offers.
                        </p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <TryOnCapabilityToggle
                          label="Garment Try-On"
                          caption="Clothing catalog and garment generation."
                          checked={storeTryOnSettings.garmentTryOnEnabled}
                          disabled={!canUpdateStore || savingStoreTryOnSettings}
                          onChange={(checked) =>
                            void updateStoreTryOnCapability(
                              "GARMENT_TRY_ON",
                              checked,
                            )
                          }
                        />
                        <TryOnCapabilityToggle
                          label="Jewellery Try-On"
                          caption="Rings, bracelets, necklaces and earrings."
                          checked={storeTryOnSettings.jewelleryTryOnEnabled}
                          disabled={!canUpdateStore || savingStoreTryOnSettings}
                          onChange={(checked) =>
                            void updateStoreTryOnCapability(
                              "JEWELLERY_TRY_ON",
                              checked,
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className="rounded-lg border bg-muted/25 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">
                            Captured Garment Preview
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Show the extracted garment preview after a garment
                            is photographed.
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          className="mt-1 size-4"
                          checked={
                            storeTryOnSettings.storeGarmentPreviewEnabled &&
                            storeTryOnSettings.garmentTryOnEnabled
                          }
                          disabled={garmentPreviewControlDisabled}
                          onChange={(event) =>
                            void updateStoreGarmentPreview(event.target.checked)
                          }
                        />
                      </div>
                      <div className="mt-3 text-xs text-muted-foreground">
                        Effective:{" "}
                        {storeTryOnSettings.effectiveGarmentPreviewEnabled
                          ? "On"
                          : "Off"}
                        {!storeTryOnSettings.garmentTryOnEnabled
                          ? " - garment Try-On is off"
                          : !storeTryOnSettings.platformGarmentPreviewEnabled
                            ? " - disabled globally"
                            : !storeTryOnSettings.storeHasGarmentPreviewPermission
                              ? " - feature not granted"
                              : ""}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-2">
                  {canUpdateStore ? (
                    <Button variant="outline" onClick={() => setEditOpen(true)}>
                      Edit Store
                    </Button>
                  ) : null}
                  {platformBypass && store.status === "ACTIVE" ? (
                    <ConfirmDialog
                      title="Deactivate Store?"
                      description="The Store remains stored and kiosk records/configuration are not deleted. Inactive Stores cannot receive new kiosk assignments."
                      confirmLabel="Deactivate"
                      destructive
                      onConfirm={() => void changeStoreStatus("INACTIVE")}
                      trigger={
                        <Button variant="destructive">Deactivate</Button>
                      }
                    />
                  ) : platformBypass ? (
                    <Button onClick={() => void changeStoreStatus("ACTIVE")}>
                      Reactivate
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </PageSection>

      <PairStoreKioskDialog
        open={pairOpen}
        disabled={store?.status !== "ACTIVE"}
        onOpenChange={setPairOpen}
        onSubmit={async (input) => {
          if (!accessToken || !store) {
            return;
          }
          await pairStoreKiosk(accessToken, store.id, input);
          setPairOpen(false);
          await load();
        }}
      />

      {store ? (
        <EditStoreDialog
          open={editOpen}
          store={store}
          onOpenChange={setEditOpen}
          onSubmit={async (input) => {
            if (!accessToken) {
              return;
            }
            await updateStore(accessToken, store.id, input);
            setEditOpen(false);
            await load();
          }}
        />
      ) : null}

      <StoreKioskConfigurationDialog
        device={configurationDevice}
        accessToken={accessToken}
        storeId={storeId}
        onOpenChange={(open) => {
          if (!open) {
            setConfigurationDevice(null);
          }
        }}
        onSaved={(configuration) => {
          setStore((current) =>
            current
              ? {
                  ...current,
                  kiosks: {
                    data: current.kiosks.data.map((device) =>
                      device.id === configurationDevice?.id
                        ? {
                            ...device,
                            latestConfigurationVersion: configuration.version,
                          }
                        : device,
                    ),
                  },
                }
              : current,
          );
        }}
      />
    </PageContainer>
  );

  async function changeStoreStatus(nextStatus: "ACTIVE" | "INACTIVE") {
    if (!accessToken || !store) {
      return;
    }
    setError(null);
    try {
      const updated =
        nextStatus === "ACTIVE"
          ? await activateStore(accessToken, store.id)
          : await deactivateStore(accessToken, store.id);
      setStore((current) => (current ? { ...current, ...updated } : current));
    } catch (caught) {
      setError(messageFor(caught));
    }
  }

  async function assignPricingPlan() {
    if (!accessToken || !store || !selectedPlanId) {
      return;
    }
    setAssigningPlan(true);
    setError(null);
    try {
      const subscription = await assignStorePricingPlan(
        accessToken,
        store.id,
        selectedPlanId,
      );
      setStore((current) =>
        current ? { ...current, subscription } : current,
      );
      setCreditDiagnostics(
        await getStoreCreditDiagnostics(accessToken, store.id).catch(
          () => null,
        ),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setAssigningPlan(false);
    }
  }

  async function topUpCredits() {
    if (!accessToken || !store) {
      return;
    }
    const quantity = Number.parseInt(topUpQuantity, 10);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError("Credit top-up must be a positive whole number.");
      return;
    }
    setToppingUpCredits(true);
    setError(null);
    try {
      const subscription = await topUpStoreCredits(accessToken, store.id, {
        quantity,
        reason: topUpReason,
      });
      setStore((current) =>
        current ? { ...current, subscription } : current,
      );
      setCreditDiagnostics(
        await getStoreCreditDiagnostics(accessToken, store.id).catch(
          () => null,
        ),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setToppingUpCredits(false);
    }
  }

  async function updateStoreGarmentPreview(enabled: boolean) {
    if (!accessToken || !store) {
      return;
    }
    setSavingStoreTryOnSettings(true);
    setError(null);
    try {
      setStoreTryOnSettings(
        await updateStoreVirtualTryOnSettings(accessToken, store.id, {
          garmentPreviewEnabled: enabled,
        }),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSavingStoreTryOnSettings(false);
    }
  }

  async function updateStoreTryOnCapability(
    capability: StoreTryOnCapability,
    enabled: boolean,
  ) {
    if (!accessToken || !store || !storeTryOnSettings) {
      return;
    }
    const current = storeTryOnSettings.enabledTryOnCapabilities;
    const next = enabled
      ? [...new Set([...current, capability])]
      : current.filter((item) => item !== capability);
    if (next.length === 0) {
      setError("At least one Try-On capability must stay enabled.");
      return;
    }

    setSavingStoreTryOnSettings(true);
    setError(null);
    try {
      setStoreTryOnSettings(
        await updateStoreVirtualTryOnSettings(accessToken, store.id, {
          enabledTryOnCapabilities: next,
        }),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSavingStoreTryOnSettings(false);
    }
  }
}

function StoreKioskConfigurationDialog({
  device,
  accessToken,
  storeId,
  onOpenChange,
  onSaved,
}: {
  device: KioskDevice | null;
  accessToken: string | null;
  storeId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (configuration: KioskConfiguration) => void;
}) {
  const open = device !== null;
  const [configuration, setConfiguration] = useState<KioskConfiguration | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [assets, setAssets] = useState<EditablePresentationAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!device || !accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await getStoreKioskConfiguration(
        accessToken,
        storeId,
        device.id,
      );
      setConfiguration(next);
      setTitle(next.display.title ?? "");
      setCtaLabel(next.display.ctaLabel);
      setAssets(next.display.assets.map(editableAssetFromConfiguration));
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, device, storeId]);

  useEffect(() => {
    if (open) {
      void load();
    } else {
      setConfiguration(null);
      setAssets([]);
      setError(null);
    }
  }, [load, open]);

  async function save() {
    if (!device || !accessToken || !configuration) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateStoreKioskConfiguration(
        accessToken,
        storeId,
        device.id,
        configurationUpdateInput(configuration, {
          title: title.trim() || null,
          ctaLabel: ctaLabel.trim() || "Start Try-On",
          assets,
        }),
      );
      setConfiguration(updated);
      setAssets(updated.display.assets.map(editableAssetFromConfiguration));
      onSaved(updated);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  async function uploadAsset(slotId: string, file: File) {
    if (!device || !accessToken || !configuration) {
      return;
    }
    const index = assets.findIndex((asset) => asset.localId === slotId);
    const slot = assets[index];
    if (index < 0 || !slot) {
      return;
    }
    const contentType = normalizedPresentationContentType(file, slot.kind);
    if (!contentType) {
      setError(
        slot.kind === "video"
          ? "Upload an MP4 video."
          : "Upload a JPG, PNG or WebP wallpaper.",
      );
      return;
    }
    let durationSeconds: number | undefined;
    try {
      durationSeconds =
        slot.kind === "video" ? await videoDurationSeconds(file) : undefined;
    } catch {
      setError("Video duration could not be read.");
      return;
    }
    if (
      durationSeconds !== undefined &&
      durationSeconds > configuration.assetUpload.maxVideoDurationSeconds
    ) {
      setError("Presentation videos must be 60 seconds or shorter.");
      return;
    }
    const maxBytes =
      slot.kind === "video"
        ? configuration.assetUpload.maxVideoBytes
        : configuration.assetUpload.maxImageBytes;
    if (file.size > maxBytes) {
      setError(
        slot.kind === "video"
          ? `Video uploads are limited to ${formatBytes(maxBytes)}.`
          : `Wallpaper uploads are limited to ${formatBytes(maxBytes)}.`,
      );
      return;
    }

    setAssets((current) =>
      current.map((asset) =>
        asset.localId === slotId
          ? { ...asset, uploadStatus: "uploading" }
          : asset,
      ),
    );
    setError(null);
    try {
      const intent = await createStoreKioskConfigurationAssetUploadIntent(
        accessToken,
        storeId,
        device.id,
        {
          contentType,
          sizeBytes: file.size,
          ...(durationSeconds ? { durationSeconds } : {}),
          fileName: file.name,
        },
      );
      const upload = await fetch(intent.uploadUrl, {
        method: intent.method,
        headers: intent.headers,
        body: file,
      });
      if (!upload.ok) {
        throw new Error("upload failed");
      }
      setAssets((current) =>
        current.map((asset) =>
          asset.localId === slotId
            ? {
                ...asset,
                type: intent.type,
                label: intent.label,
                assetRef: intent.assetRef,
                contentType,
                sizeBytes: file.size,
                durationSeconds: durationSeconds ?? null,
                bundledAssetKey: undefined,
                url: undefined,
                uploadStatus: "ready",
              }
            : asset,
        ),
      );
    } catch (caught) {
      setAssets((current) =>
        current.map((asset) =>
          asset.localId === slotId ? { ...asset, uploadStatus: "idle" } : asset,
        ),
      );
      setError(messageFor(caught));
    }
  }

  function addSlot(kind: PresentationAssetKind) {
    const count = assets.filter((asset) => asset.kind === kind).length;
    const max = kind === "video" ? maxVideoSlots : maxWallpaperSlots;
    if (count >= max) {
      setError(
        kind === "video"
          ? `A kiosk can use up to ${maxVideoSlots} video slots.`
          : `A kiosk can use up to ${maxWallpaperSlots} wallpaper slots.`,
      );
      return;
    }
    setAssets((current) => [
      ...current,
      emptyPresentationAsset(kind, `${kind}-${Date.now()}`),
    ]);
  }

  function removeSlot(slotId: string) {
    if (assets.length <= 1) {
      setError("At least one presentation asset is required.");
      return;
    }
    setAssets((current) => current.filter((asset) => asset.localId !== slotId));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Store Kiosk Configuration</DialogTitle>
          <DialogDescription>
            {device
              ? `${device.displayName} runtime settings for this Store.`
              : "Runtime settings for this Store."}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {loading ? (
          <div className="py-8 text-sm text-muted-foreground">
            Loading Store kiosk configuration...
          </div>
        ) : configuration ? (
          <div className="space-y-4">
            <DetailRow
              label="Current Version"
              value={`v${configuration.version}`}
            />
            <DetailRow
              label="Presentation Assets"
              value={String(configuration.display.assets.length)}
            />
            <label className="space-y-2 text-sm">
              <span>Display Title</span>
              <Input
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span>CTA Label</span>
              <Input
                value={ctaLabel}
                maxLength={40}
                onChange={(event) => setCtaLabel(event.target.value)}
              />
            </label>
            <div className="space-y-3 rounded-lg border bg-muted/25 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">
                    Start Screen Playlist
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Uploaded media is cached by the kiosk and refreshed only
                    when this configuration changes.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addSlot("video")}
                    disabled={videoSlotCount(assets) >= maxVideoSlots}
                  >
                    <VideoIcon aria-hidden="true" />
                    Add Video
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addSlot("wallpaper")}
                    disabled={wallpaperSlotCount(assets) >= maxWallpaperSlots}
                  >
                    <ImageIcon aria-hidden="true" />
                    Add Wallpaper
                  </Button>
                </div>
              </div>
              <div className="grid gap-3">
                {assets.map((asset, index) => (
                  <PresentationAssetSlot
                    key={asset.localId}
                    asset={asset}
                    index={index}
                    onUpload={(file) => void uploadAsset(asset.localId, file)}
                    onRemove={() => removeSlot(asset.localId)}
                  />
                ))}
              </div>
              <div className="text-xs text-muted-foreground">
                Videos: {videoSlotCount(assets)}/{maxVideoSlots} - Wallpapers:{" "}
                {wallpaperSlotCount(assets)}/{maxWallpaperSlots} - Max video
                length: {configuration.assetUpload.maxVideoDurationSeconds}s
              </div>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            disabled={
              loading ||
              saving ||
              !configuration ||
              assets.some((asset) => !presentationAssetIsReady(asset))
            }
            onClick={() => void save()}
          >
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({
  label,
  value,
  icon,
  caption,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  caption: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold">{value}</div>
        </div>
        <div className="grid size-9 place-items-center rounded-lg border bg-muted/40 text-primary">
          {icon}
        </div>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">{caption}</div>
    </div>
  );
}

function PlanInfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/25 p-4">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-base font-semibold">{value}</div>
    </div>
  );
}

type CreditHealth = "UNKNOWN" | "HEALTHY" | "LOW" | "EMPTY";

function CreditStatusNotice({
  canManagePricing,
  health,
}: {
  canManagePricing: boolean;
  health: CreditHealth;
}) {
  if (health === "HEALTHY" || health === "UNKNOWN") {
    return null;
  }
  const empty = health === "EMPTY";
  return (
    <div
      className={[
        "mt-5 rounded-lg border p-4",
        empty
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-amber-300 bg-amber-50 text-amber-950",
      ].join(" ")}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangleIcon className="mt-0.5 size-5" aria-hidden="true" />
          <div>
            <div className="font-semibold">
              {empty ? "Try-On is paused" : "Try-On credits are low"}
            </div>
            <p className="mt-1 text-sm">
              {empty
                ? "This Store has no Try-On credits left. Shopify shoppers will see a temporary unavailable message until credits are added."
                : `This Store has ${lowCreditThreshold} or fewer Try-On credits remaining.`}
            </p>
          </div>
        </div>
        {canManagePricing ? (
          <Button
            render={<a href="#manual-credit-top-up" />}
            variant={empty ? "destructive" : "outline"}
          >
            Add credits
          </Button>
        ) : (
          <Button render={<Link href="/app/billing" />} variant="outline">
            Open billing
          </Button>
        )}
      </div>
    </div>
  );
}

function StoreInfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border bg-background/70 p-3 text-sm">
      <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-muted/50 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 break-words font-medium">{value}</div>
      </div>
    </div>
  );
}

function TryOnCapabilityToggle({
  label,
  caption,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  caption: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border bg-background p-3 text-sm transition-colors hover:bg-muted/40">
      <input
        type="checkbox"
        className="mt-1 size-4"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {caption}
        </span>
      </span>
    </label>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 break-words">{value}</div>
    </div>
  );
}

type PresentationAssetKind = "video" | "wallpaper";

type EditablePresentationAsset = {
  localId: string;
  kind: PresentationAssetKind;
  type: KioskConfigurationAssetType;
  label: string;
  url?: string;
  bundledAssetKey?: string;
  assetRef?: string;
  contentType?: string;
  sizeBytes?: number;
  durationSeconds?: number | null;
  uploadStatus: "idle" | "uploading" | "ready";
};

const maxVideoSlots = 5;
const maxWallpaperSlots = 5;

function PresentationAssetSlot({
  asset,
  index,
  onUpload,
  onRemove,
}: {
  asset: EditablePresentationAsset;
  index: number;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const isVideo = asset.kind === "video";
  const ready = presentationAssetIsReady(asset);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border bg-background p-3 text-sm">
      <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted/50 text-primary">
        {isVideo ? (
          <VideoIcon size={17} aria-hidden="true" />
        ) : (
          <ImageIcon size={17} aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {isVideo ? "Video" : "Wallpaper"} {index + 1}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {asset.label}
          {asset.durationSeconds ? ` - ${asset.durationSeconds}s` : ""}
          {asset.sizeBytes ? ` - ${formatBytes(asset.sizeBytes)}` : ""}
        </div>
      </div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted/50">
        <UploadIcon size={15} aria-hidden="true" />
        {asset.uploadStatus === "uploading" ? "Uploading" : "Upload"}
        <input
          type="file"
          className="sr-only"
          disabled={asset.uploadStatus === "uploading"}
          accept={isVideo ? "video/mp4" : "image/jpeg,image/png,image/webp"}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            if (file) {
              onUpload(file);
            }
          }}
        />
      </label>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRemove}
        disabled={asset.uploadStatus === "uploading"}
      >
        <Trash2Icon aria-hidden="true" />
        Remove
      </Button>
      {!ready ? (
        <div className="basis-full text-xs text-muted-foreground">
          Upload media for this slot before saving.
        </div>
      ) : null}
    </div>
  );
}

function PairStoreKioskDialog({
  open,
  disabled,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    pairingCode: string;
    displayName: string;
  }) => Promise<void>;
}) {
  const [pairingCode, setPairingCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const canonicalCode = pairingCode.replace(/\s/g, "");
    if (!/^\d{6}$/.test(canonicalCode)) {
      setError("Pairing code expired or invalid.");
      return;
    }
    if (!displayName.trim()) {
      setError("Device name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ pairingCode: canonicalCode, displayName });
      setPairingCode("");
      setDisplayName("");
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pair Kiosk</DialogTitle>
          <DialogDescription>
            Enter the six-digit code shown on the physical kiosk. This kiosk
            will be assigned to this Store automatically.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {disabled ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            Inactive Stores cannot receive new kiosk assignments.
          </div>
        ) : null}
        <div className="space-y-4">
          <label className="space-y-2 text-sm">
            <span>Pairing Code</span>
            <Input
              value={pairingCode}
              inputMode="numeric"
              placeholder="482731"
              maxLength={7}
              onChange={(event) => setPairingCode(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Device Name</span>
            <Input
              value={displayName}
              maxLength={160}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={disabled || submitting || !displayName.trim()}
            onClick={() => void submit()}
          >
            Pair
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditStoreDialog({
  open,
  store,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  store: AdminStoreDetail;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: StoreInput) => Promise<void>;
}) {
  const [name, setName] = useState(store.name);
  const [contactEmail, setContactEmail] = useState(store.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(store.contactPhone ?? "");
  const [website, setWebsite] = useState(store.website ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim()) {
      setError("Store name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(
        cleanStoreInput({
          name,
          contactEmail,
          contactPhone,
          website,
          timezone: store.timezone,
        }),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Store</DialogTitle>
          <DialogDescription>Update Store details.</DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <div className="space-y-4">
          <label className="space-y-2 text-sm">
            <span>Store Name *</span>
            <Input
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Contact Email</span>
            <Input
              value={contactEmail}
              maxLength={254}
              onChange={(event) => setContactEmail(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Contact Phone</span>
            <Input
              value={contactPhone}
              maxLength={40}
              onChange={(event) => setContactPhone(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Website</span>
            <Input
              value={website}
              maxLength={2048}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={submitting} onClick={() => void submit()}>
            Save Store
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function configurationUpdateInput(
  configuration: KioskConfiguration,
  overrides: {
    title: string | null;
    ctaLabel: string;
    assets: EditablePresentationAsset[];
  },
): KioskConfigurationUpdateInput {
  return {
    display: {
      idleMode: configuration.display.idleMode,
      slideDurationSeconds: configuration.display.slideDurationSeconds,
      title: overrides.title,
      subtitle: configuration.display.subtitle,
      ctaLabel: overrides.ctaLabel,
      assets: overrides.assets.map((asset) => ({
        type: asset.type as KioskConfigurationAssetType,
        label: asset.label,
        ...(asset.url ? { url: asset.url } : {}),
        ...(asset.bundledAssetKey
          ? { bundledAssetKey: asset.bundledAssetKey }
          : {}),
        ...(asset.assetRef ? { assetRef: asset.assetRef } : {}),
        ...(asset.contentType ? { contentType: asset.contentType } : {}),
        ...(asset.sizeBytes ? { sizeBytes: asset.sizeBytes } : {}),
        ...(asset.durationSeconds
          ? { durationSeconds: asset.durationSeconds }
          : {}),
      })),
    },
    capture: {
      countdownSeconds: configuration.capture.countdownSeconds,
      soundEnabled: configuration.capture.soundEnabled,
      soundProfile: configuration.capture.soundProfile,
      guidanceAudioEnabled: configuration.capture.guidanceAudioEnabled,
    },
    experience: {
      enabledGarmentIntents: configuration.experience.enabledGarmentIntents,
      multiGarmentSelectionEnabled:
        configuration.experience.multiGarmentSelectionEnabled ?? true,
      maxTryOnPicks: configuration.experience.maxTryOnPicks ?? 5,
      sessionIdleTimeoutSeconds:
        configuration.experience.sessionIdleTimeoutSeconds,
    },
  };
}

function editableAssetFromConfiguration(
  asset: KioskConfiguration["display"]["assets"][number],
): EditablePresentationAsset {
  return {
    localId: asset.id,
    kind: presentationAssetKind(asset),
    type: asset.type,
    label: asset.label,
    url: asset.url ?? undefined,
    bundledAssetKey: asset.bundledAssetKey ?? undefined,
    assetRef: asset.assetRef ?? undefined,
    contentType: asset.contentType ?? undefined,
    sizeBytes: asset.sizeBytes ?? undefined,
    durationSeconds: asset.durationSeconds,
    uploadStatus: "ready",
  };
}

function emptyPresentationAsset(
  kind: PresentationAssetKind,
  localId: string,
): EditablePresentationAsset {
  return {
    localId,
    kind,
    type: "UPLOADED_IMAGE",
    label: kind === "video" ? "New video slot" : "New wallpaper slot",
    contentType: kind === "video" ? "video/mp4" : undefined,
    uploadStatus: "idle",
  };
}

function presentationAssetKind(
  asset: Pick<
    KioskConfiguration["display"]["assets"][number],
    "bundledAssetKey" | "contentType"
  >,
): PresentationAssetKind {
  return asset.contentType === "video/mp4" ||
    asset.bundledAssetKey === "selfx-default-kiosk-video"
    ? "video"
    : "wallpaper";
}

function presentationAssetIsReady(asset: EditablePresentationAsset): boolean {
  if (asset.uploadStatus === "uploading") {
    return false;
  }
  if (asset.type === "BUNDLED_IMAGE") {
    return Boolean(asset.bundledAssetKey);
  }
  if (asset.type === "UPLOADED_IMAGE") {
    return Boolean(asset.assetRef && asset.contentType && asset.sizeBytes);
  }
  return Boolean(asset.url);
}

function videoSlotCount(assets: EditablePresentationAsset[]): number {
  return assets.filter((asset) => asset.kind === "video").length;
}

function wallpaperSlotCount(assets: EditablePresentationAsset[]): number {
  return assets.filter((asset) => asset.kind === "wallpaper").length;
}

function normalizedPresentationContentType(
  file: File,
  kind: PresentationAssetKind,
): string | null {
  const contentType = file.type.toLowerCase().split(";")[0]?.trim();
  if (kind === "video") {
    return contentType === "video/mp4" ||
      file.name.toLowerCase().endsWith(".mp4")
      ? "video/mp4"
      : null;
  }
  if (
    contentType === "image/jpeg" ||
    contentType === "image/png" ||
    contentType === "image/webp"
  ) {
    return contentType;
  }
  return null;
}

function videoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      const duration = Math.ceil(video.duration);
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("Video duration could not be read."));
        return;
      }
      resolve(duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Video duration could not be read."));
    };
    video.src = objectUrl;
  });
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `${Math.round(value / (1024 * 1024))} MB`;
  }
  return `${Math.round(value / 1024)} KB`;
}

function cleanStoreInput(input: StoreInput): StoreInput {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      typeof value === "string" ? value.trim() !== "" : value !== undefined,
    ),
  ) as StoreInput;
}

function storeLocation(store: AdminStoreDetail): string {
  return [store.city, store.stateRegion, store.country]
    .filter(Boolean)
    .join(", ");
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "-";
}

function formatLedgerType(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function creditHealthFor(availableCredits: number | null): CreditHealth {
  if (availableCredits == null) {
    return "UNKNOWN";
  }
  if (availableCredits <= 0) {
    return "EMPTY";
  }
  if (availableCredits <= lowCreditThreshold) {
    return "LOW";
  }
  return "HEALTHY";
}

function creditStatusCaption(
  health: CreditHealth,
  planName: string | undefined,
): string {
  if (health === "EMPTY") {
    return "Try-On paused";
  }
  if (health === "LOW") {
    return "Low credits";
  }
  return planName ? `${planName} plan` : "Trial or unassigned";
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  return "The Store request could not be completed.";
}
