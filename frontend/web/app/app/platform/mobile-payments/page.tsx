"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageContainer,
  PageHeader,
} from "@selfx/ui";
import { selfxApi, SafeApiError } from "@/lib/api";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { useSession } from "@/lib/session";

type Settings = {
  configured: boolean;
  enabled: boolean;
  environment: string | null;
  executionEnabled: boolean;
  updatedAt: string | null;
};

export default function MobilePaymentsPage() {
  const session = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [environment, setEnvironment] = useState<"UAT" | "PRODUCTION">(
    "UAT",
  );
  const [merchantId, setMerchantId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [providerStoreId, setProviderStoreId] = useState("");
  const [saltIndex, setSaltIndex] = useState("");
  const [saltKey, setSaltKey] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [canView, setCanView] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const access = await getCurrentPlatformAccess(accessToken);
      setCanView(
        access.isSuperadmin || access.permissions.includes("INTEGRATIONS_VIEW"),
      );
      setCanManage(
        access.isSuperadmin ||
          access.permissions.includes("INTEGRATIONS_MANAGE"),
      );
      const next = await selfxApi<Settings>("/api/v1/admin/mobile-payments", {
        accessToken,
      });
      setSettings(next);
      if (next.environment === "UAT" || next.environment === "PRODUCTION")
        setEnvironment(next.environment);
      setEnabled(next.enabled);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Mobile payment settings could not be loaded.",
      );
    }
  }, [accessToken]);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setError("");
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
    <PageContainer>
      <PageHeader
        title="Mobile Payments"
        description="SelfX mobile checkout, separate from Store payment gateways."
      />
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {canView && (
        <Card>
          <CardHeader>
          <CardTitle>PhonePe Dynamic QR</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              {settings?.configured
                ? `${settings.environment} credentials saved`
                : "No account configured"}{" "}
              · {settings?.enabled ? "Enabled" : "Disabled"}
            </p>
            <p>
              Server execution:{" "}
              {settings?.executionEnabled ? "Enabled" : "Disabled"}. Customer
              purchases require a production PhonePe account and
              SELFX_MOBILE_PHONEPE_ENABLED=true and a confirmed production PhonePe endpoint on the API.
            </p>
            <p>
              Customers can open a UPI app directly or share a short-lived QR.
              Monthly plans require a new payment each month. Credits are granted
              only after PhonePe confirms payment.
            </p>
            {canManage && (
              <form onSubmit={save} className="grid max-w-xl gap-4">
                <Label htmlFor="mobile-environment">Environment</Label>
                <select
                  id="mobile-environment"
                  value={environment}
                  onChange={(e) =>
                    setEnvironment(e.target.value as "UAT" | "PRODUCTION")
                  }
                  className="rounded border p-2"
                >
                  <option value="UAT">UAT</option>
                  <option value="PRODUCTION">Production</option>
                </select>
                <Label htmlFor="mobile-merchant">Merchant ID</Label>
                <Input
                  id="mobile-merchant"
                  value={merchantId}
                  onChange={(e) => setMerchantId(e.target.value)}
                  required
                />
                <Label htmlFor="mobile-provider">Provider ID (if supplied by PhonePe)</Label>
                <Input
                  id="mobile-provider"
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                />
                <Label htmlFor="mobile-store">PhonePe Store reference (if supplied)</Label>
                <Input
                  id="mobile-store"
                  value={providerStoreId}
                  onChange={(e) => setProviderStoreId(e.target.value)}
                />
                <Label htmlFor="mobile-salt-index">Salt Index</Label>
                <Input
                  id="mobile-salt-index"
                  value={saltIndex}
                  onChange={(e) => setSaltIndex(e.target.value)}
                  required
                />
                <Label htmlFor="mobile-secret">Salt Key</Label>
                <Input
                  id="mobile-secret"
                  type="password"
                  value={saltKey}
                  onChange={(e) => setSaltKey(e.target.value)}
                  required
                />
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />{" "}
                  Enable customer checkout
                </label>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save PhonePe setup"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
