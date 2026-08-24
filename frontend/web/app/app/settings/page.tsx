"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCwIcon, ShieldAlertIcon } from "lucide-react";

import {
  Button,
  PageContainer,
  PageHeader,
  PageSection,
  TableContainer,
} from "@selfx/ui";

import {
  platformCurrencyOptions,
  ProductSelectMenu,
  ProductToggleCheckbox,
} from "@/components/product-form-controls";
import { SafeApiError } from "@/lib/api";
import {
  getPlatformVirtualTryOnSettings,
  updatePlatformVirtualTryOnSettings,
  type PlatformVirtualTryOnSettings,
} from "@/lib/platform-settings";
import { useSession } from "@/lib/session";

export default function SettingsPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [settings, setSettings] =
    useState<PlatformVirtualTryOnSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSettings(await getPlatformVirtualTryOnSettings(accessToken));
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setGarmentPreviewEnabled(enabled: boolean) {
    if (!accessToken || !settings) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      setSettings(
        await updatePlatformVirtualTryOnSettings(accessToken, {
          garmentPreviewEnabled: enabled,
        }),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  async function setDefaultCurrency(defaultCurrency: string) {
    if (!accessToken || !settings) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      setSettings(
        await updatePlatformVirtualTryOnSettings(accessToken, {
          defaultCurrency,
        }),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Platform Settings"
        title="Settings"
        description="Platform-wide SelfX controls."
        actions={
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCwIcon aria-hidden="true" />
            Refresh
          </Button>
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
        <TableContainer
          title="Virtual Try-On"
          description="Global controls for SelfX Virtual Try-On behavior."
        >
          {loading ? (
            <div className="py-8 text-sm text-muted-foreground">
              Loading Platform settings...
            </div>
          ) : settings ? (
            <div className="space-y-4">
              <label className="flex items-start gap-3 rounded-lg border p-4 text-sm">
                <ProductToggleCheckbox
                  checked={settings.garmentPreviewEnabled}
                  disabled={saving}
                  onChange={(checked) => void setGarmentPreviewEnabled(checked)}
                />
                <span>
                  <span className="block font-medium">
                    Captured Garment Preview
                  </span>
                  <span className="block text-muted-foreground">
                    Allow garment extraction previews across the platform.
                    Turning this off disables captured-garment preview for all
                    Stores.
                  </span>
                </span>
              </label>
              <div className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
                <div>
                  <div className="font-medium">Default Currency</div>
                  <div className="text-muted-foreground">
                    Used by product pricing throughout Store and Platform
                    catalog management.
                  </div>
                </div>
                <ProductSelectMenu
                  ariaLabel="Select default currency"
                  value={settings.defaultCurrency}
                  options={platformCurrencyOptions}
                  onChange={(value) => void setDefaultCurrency(value)}
                />
              </div>
            </div>
          ) : null}
        </TableContainer>
      </PageSection>
    </PageContainer>
  );
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  return "Platform settings could not be loaded.";
}
