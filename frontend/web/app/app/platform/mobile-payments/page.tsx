"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Settings2Icon } from "lucide-react";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PageContainer,
  PageHeader,
  PageSection,
  SelectMenu,
  Switch,
} from "@selfx/ui";
import { selfxApi, SafeApiError } from "@/lib/api";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { useSession } from "@/lib/session";

type Settings = {
  configured: boolean;
  enabled: boolean;
  environment: "UAT" | "PRODUCTION" | null;
  executionEnabled: boolean;
  updatedAt: string | null;
};

export default function MobilePaymentsPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [canView, setCanView] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [environment, setEnvironment] = useState<"UAT" | "PRODUCTION">("UAT");
  const [merchantId, setMerchantId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [providerStoreId, setProviderStoreId] = useState("");
  const [saltIndex, setSaltIndex] = useState("");
  const [saltKey, setSaltKey] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const access = await getCurrentPlatformAccess(accessToken);
      const view =
        access.isSuperadmin ||
        access.permissions.includes("INTEGRATIONS_VIEW") ||
        access.permissions.includes("INTEGRATIONS_MANAGE");
      setCanView(view);
      setCanManage(
        access.isSuperadmin ||
          access.permissions.includes("INTEGRATIONS_MANAGE"),
      );
      if (view) {
        setSettings(
          await selfxApi<Settings>("/api/v1/admin/mobile-payments", {
            accessToken,
          }),
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Mobile payment settings could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  function openSetup() {
    setEnvironment(settings?.environment ?? "UAT");
    setEnabled(settings?.enabled ?? false);
    setMerchantId("");
    setProviderId("");
    setProviderStoreId("");
    setSaltIndex("");
    setSaltKey("");
    setError(null);
    setDialogOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await selfxApi<Settings>("/api/v1/admin/mobile-payments", {
        accessToken,
        method: "PUT",
        body: JSON.stringify({
          environment,
          merchantId,
          providerId,
          providerStoreId,
          saltIndex,
          saltKey,
          enabled,
        }),
      });
      setSettings(next);
      setNotice(
        `PhonePe mobile payment setup saved successfully. Customer checkout is ${next.enabled && next.executionEnabled ? "available" : "not available yet"}.`,
      );
      setDialogOpen(false);
      setMerchantId("");
      setProviderId("");
      setProviderStoreId("");
      setSaltIndex("");
      setSaltKey("");
    } catch (cause) {
      setError(
        cause instanceof SafeApiError || cause instanceof Error
          ? cause.message
          : "Could not save mobile payments.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Mobile Payments"
        description="Manage the SelfX mobile checkout account separately from Store payment gateways."
      />
      <PageSection>
        {error && !dialogOpen && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert
            role="status"
            className="border-emerald-200 bg-emerald-50 text-emerald-900"
          >
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {loading ? (
          <p className="text-sm text-muted-foreground">
            Loading mobile payments…
          </p>
        ) : !canView ? (
          <p className="text-sm text-muted-foreground">
            You do not have permission to view mobile payments.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-12 shrink-0 place-items-center rounded-xl border bg-purple-50 font-heading text-lg font-bold text-purple-700"
                >
                  Pe
                </span>
                <div className="min-w-0 space-y-2">
                  <CardTitle>PhonePe</CardTitle>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant={settings?.configured ? "default" : "outline"}
                    >
                      {settings?.configured ? "Configured" : "Needs setup"}
                    </Badge>
                    {settings?.configured && (
                      <Badge
                        variant={
                          settings.enabled && settings.executionEnabled
                            ? "default"
                            : "outline"
                        }
                      >
                        {settings.enabled && settings.executionEnabled
                          ? "Customer checkout available"
                          : "Checkout unavailable"}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p className="text-muted-foreground">
                  Dynamic UPI QR payments for mobile customers.
                </p>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="font-medium">Mobile checkout</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {settings?.configured
                      ? `${settings.environment === "PRODUCTION" ? "Production" : "UAT"} account saved · API execution ${settings.executionEnabled ? "enabled" : "disabled"}`
                      : "Configure a SelfX PhonePe account to offer mobile payments."}
                  </p>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={!canManage}
                  onClick={openSetup}
                >
                  <Settings2Icon aria-hidden="true" />
                  {settings?.configured ? "Update setup" : "Set up PhonePe"}
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}
      </PageSection>
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => !saving && setDialogOpen(open)}
      >
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
          showCloseButton={!saving}
        >
          <DialogHeader>
            <DialogTitle>
              {settings?.configured ? "Update PhonePe setup" : "Set up PhonePe"}
            </DialogTitle>
            <DialogDescription>
              {settings?.configured
                ? "Enter the full PhonePe credential set to replace the saved setup. Saved secrets are never displayed."
                : "Enter the SelfX PhonePe Dynamic QR account credentials for mobile checkout."}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form
            onSubmit={(event) => void save(event)}
            className="grid gap-4"
            autoComplete="off"
          >
            <div className="grid gap-2">
              <Label htmlFor="mobile-environment">Environment</Label>
              <SelectMenu
                id="mobile-environment"
                ariaLabel="Environment"
                value={environment}
                options={[
                  { value: "UAT", label: "UAT / test" },
                  { value: "PRODUCTION", label: "Production / live" },
                ]}
                onChange={(value) => {
                  setEnvironment(value);
                  if (value !== "PRODUCTION") setEnabled(false);
                }}
                disabled={saving}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mobile-merchant">Merchant ID</Label>
              <Input
                id="mobile-merchant"
                value={merchantId}
                onChange={(event) => setMerchantId(event.target.value)}
                required
                disabled={saving}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mobile-provider">
                Provider ID (if supplied by PhonePe)
              </Label>
              <Input
                id="mobile-provider"
                value={providerId}
                onChange={(event) => setProviderId(event.target.value)}
                disabled={saving}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mobile-store">
                PhonePe Store reference (if supplied)
              </Label>
              <Input
                id="mobile-store"
                value={providerStoreId}
                onChange={(event) => setProviderStoreId(event.target.value)}
                disabled={saving}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mobile-salt-index">Salt Index</Label>
              <Input
                id="mobile-salt-index"
                value={saltIndex}
                onChange={(event) => setSaltIndex(event.target.value)}
                required
                disabled={saving}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mobile-secret">Salt Key</Label>
              <Input
                id="mobile-secret"
                type="password"
                value={saltKey}
                onChange={(event) => setSaltKey(event.target.value)}
                required
                disabled={saving}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-3">
              <div>
                <p className="text-sm font-medium">Enable customer checkout</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Requires production credentials and enabled API execution.
                </p>
              </div>
              <Switch
                aria-label="Enable customer checkout"
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={saving || environment !== "PRODUCTION"}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save PhonePe setup"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
