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
  const [environment, setEnvironment] = useState<"SANDBOX" | "PRODUCTION">(
    "SANDBOX",
  );
  const [merchantId, setMerchantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientVersion, setClientVersion] = useState("");
  const [clientSecret, setClientSecret] = useState("");
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
      if (next.environment === "SANDBOX" || next.environment === "PRODUCTION")
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
          clientId,
          clientVersion,
          clientSecret,
          enabled,
        }),
      });
      setSettings(next);
      setClientSecret("");
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
            <CardTitle>PhonePe checkout</CardTitle>
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
              SELFX_MOBILE_PHONEPE_ENABLED=true on the API.
            </p>
            <p>
              Customers can pay once for a credit pack or each month for a
              monthly plan. Monthly plans do not renew automatically. Credits
              are granted only after PhonePe confirms payment.
            </p>
            {canManage && (
              <form onSubmit={save} className="grid max-w-xl gap-4">
                <Label htmlFor="mobile-environment">Environment</Label>
                <select
                  id="mobile-environment"
                  value={environment}
                  onChange={(e) =>
                    setEnvironment(e.target.value as "SANDBOX" | "PRODUCTION")
                  }
                  className="rounded border p-2"
                >
                  <option value="SANDBOX">Sandbox</option>
                  <option value="PRODUCTION">Production</option>
                </select>
                <Label htmlFor="mobile-merchant">Merchant ID</Label>
                <Input
                  id="mobile-merchant"
                  value={merchantId}
                  onChange={(e) => setMerchantId(e.target.value)}
                  required
                />
                <Label htmlFor="mobile-client">Client ID</Label>
                <Input
                  id="mobile-client"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                />
                <Label htmlFor="mobile-version">Client version</Label>
                <Input
                  id="mobile-version"
                  value={clientVersion}
                  onChange={(e) => setClientVersion(e.target.value)}
                  required
                />
                <Label htmlFor="mobile-secret">Client secret</Label>
                <Input
                  id="mobile-secret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
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
