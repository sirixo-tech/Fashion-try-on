"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircleIcon, RefreshCwIcon, ShieldAlertIcon } from "lucide-react";

import {
  Button,
  Input,
  Label,
  PageContainer,
  PageHeader,
  PageSection,
  TableContainer,
  Textarea,
} from "@selfx/ui";

import {
  platformCurrencyOptions,
  ProductSelectMenu,
  ProductToggleCheckbox,
} from "@/components/product-form-controls";
import { SafeApiError } from "@/lib/api";
import {
  getLoginPageSettings,
  getPlatformMediaUploadSettings,
  getPlatformVirtualTryOnSettings,
  updateLoginPageSettings,
  updatePlatformMediaUploadSettings,
  updatePlatformVirtualTryOnSettings,
  type LoginPageMediaType,
  type LoginPageSettings,
  type PlatformMediaUploadSettings,
  type PlatformVirtualTryOnSettings,
} from "@/lib/platform-settings";
import { useSession } from "@/lib/session";

export default function SettingsPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [settings, setSettings] = useState<PlatformVirtualTryOnSettings | null>(
    null,
  );
  const [mediaSettings, setMediaSettings] =
    useState<PlatformMediaUploadSettings | null>(null);
  const [loginSettings, setLoginSettings] = useState<LoginPageSettings | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) {
      return;
    }
    const timeout = window.setTimeout(() => setSuccessMessage(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const [nextSettings, nextLoginSettings, nextMediaSettings] =
        await Promise.all([
          getPlatformVirtualTryOnSettings(accessToken),
          getLoginPageSettings(accessToken),
          getPlatformMediaUploadSettings(accessToken),
        ]);
      setSettings(nextSettings);
      setLoginSettings(nextLoginSettings);
      setMediaSettings(nextMediaSettings);
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
    setSuccessMessage(null);
    try {
      setSettings(
        await updatePlatformVirtualTryOnSettings(accessToken, {
          garmentPreviewEnabled: enabled,
        }),
      );
      setSuccessMessage("Platform settings saved.");
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
    setSuccessMessage(null);
    try {
      setSettings(
        await updatePlatformVirtualTryOnSettings(accessToken, {
          defaultCurrency,
        }),
      );
      setSuccessMessage("Default currency saved.");
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  async function saveLoginSettings() {
    if (!accessToken || !loginSettings) {
      return;
    }
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      setLoginSettings(
        await updateLoginPageSettings(accessToken, loginSettings),
      );
      setSuccessMessage("Login page saved.");
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  async function saveMediaSettings(
    input: Pick<
      PlatformMediaUploadSettings,
      "captureImageMaxMb" | "presentationImageMaxMb" | "presentationVideoMaxMb"
    >,
  ) {
    if (!accessToken || !mediaSettings) {
      return;
    }
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      setMediaSettings(
        await updatePlatformMediaUploadSettings(accessToken, input),
      );
      setSuccessMessage("Media upload limits saved.");
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  function updateLoginDraft(input: Partial<LoginPageSettings>) {
    setLoginSettings((current) =>
      current ? { ...current, ...input } : current,
    );
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

      {successMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-6 top-6 z-50 flex max-w-sm items-center gap-3 rounded-lg bg-[#FF7119] px-4 py-3 text-sm font-semibold text-white shadow-lg"
        >
          <CheckCircleIcon size={18} aria-hidden="true" />
          {successMessage}
        </div>
      ) : null}

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

      <PageSection>
        <TableContainer
          title="Media Upload Limits"
          description="Active platform limits for kiosk capture and managed kiosk media."
        >
          {loading ? (
            <div className="py-8 text-sm text-muted-foreground">
              Loading media upload limits...
            </div>
          ) : mediaSettings ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <LimitSelect
                title="Live capture images"
                description={`Person and garment captures sent from kiosk apps. Server ceiling ${formatMb(mediaSettings.imageHardMaxBytes)}.`}
                value={mediaSettings.captureImageMaxMb}
                options={imageLimitOptions}
                disabled={saving}
                onChange={(captureImageMaxMb) =>
                  void saveMediaSettings({
                    captureImageMaxMb,
                    presentationImageMaxMb:
                      mediaSettings.presentationImageMaxMb,
                    presentationVideoMaxMb:
                      mediaSettings.presentationVideoMaxMb,
                  })
                }
              />
              <LimitSelect
                title="Presentation images"
                description={`Managed start-screen images for kiosks. Server ceiling ${formatMb(mediaSettings.imageHardMaxBytes)}.`}
                value={mediaSettings.presentationImageMaxMb}
                options={imageLimitOptions}
                disabled={saving}
                onChange={(presentationImageMaxMb) =>
                  void saveMediaSettings({
                    captureImageMaxMb: mediaSettings.captureImageMaxMb,
                    presentationImageMaxMb,
                    presentationVideoMaxMb:
                      mediaSettings.presentationVideoMaxMb,
                  })
                }
              />
              <LimitSelect
                title="Presentation videos"
                description={`Managed start-screen MP4 videos for kiosks. Server ceiling ${formatMb(mediaSettings.videoHardMaxBytes)}.`}
                value={mediaSettings.presentationVideoMaxMb}
                options={videoLimitOptions}
                disabled={saving}
                onChange={(presentationVideoMaxMb) =>
                  void saveMediaSettings({
                    captureImageMaxMb: mediaSettings.captureImageMaxMb,
                    presentationImageMaxMb:
                      mediaSettings.presentationImageMaxMb,
                    presentationVideoMaxMb,
                  })
                }
              />
            </div>
          ) : null}
        </TableContainer>
      </PageSection>

      <PageSection>
        <TableContainer
          title="Login Page"
          description="Public sign-in media and copy shown on the SelfX login page."
        >
          {loading ? (
            <div className="py-8 text-sm text-muted-foreground">
              Loading login page settings...
            </div>
          ) : loginSettings ? (
            <div className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
                <label className="space-y-2 text-sm">
                  <span>Media URL</span>
                  <Input
                    value={loginSettings.mediaUrl}
                    maxLength={2048}
                    placeholder="/kiosk/default-start-screen.mp4"
                    onChange={(event) =>
                      updateLoginDraft({ mediaUrl: event.target.value })
                    }
                  />
                </label>
                <div className="space-y-2 text-sm">
                  <Label>Media Type</Label>
                  <ProductSelectMenu
                    ariaLabel="Select login page media type"
                    value={loginSettings.mediaType}
                    options={loginMediaTypeOptions}
                    onChange={(value) => updateLoginDraft({ mediaType: value })}
                  />
                </div>
              </div>
              <label className="space-y-2 text-sm">
                <span>Video Poster URL</span>
                <Input
                  value={loginSettings.mediaPosterUrl ?? ""}
                  maxLength={2048}
                  placeholder="Optional poster image for video"
                  onChange={(event) =>
                    updateLoginDraft({
                      mediaPosterUrl: event.target.value || null,
                    })
                  }
                />
              </label>
              <label className="flex items-start gap-3 rounded-lg border p-4 text-sm">
                <ProductToggleCheckbox
                  checked={loginSettings.mediaMuted === false}
                  disabled={saving || loginSettings.mediaType !== "VIDEO"}
                  onChange={(checked) =>
                    updateLoginDraft({ mediaMuted: !checked })
                  }
                />
                <span>
                  <span className="block font-medium">Login Video Sound</span>
                  <span className="block text-muted-foreground">
                    Keep off for reliable autoplay. Turn on only when the login
                    video should play with sound.
                  </span>
                </span>
              </label>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
                <label className="space-y-2 text-sm">
                  <span>Eyebrow</span>
                  <Input
                    value={loginSettings.eyebrow}
                    maxLength={80}
                    onChange={(event) =>
                      updateLoginDraft({ eyebrow: event.target.value })
                    }
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span>Headline</span>
                  <Input
                    value={loginSettings.headline}
                    maxLength={120}
                    onChange={(event) =>
                      updateLoginDraft({ headline: event.target.value })
                    }
                  />
                </label>
              </div>
              <label className="space-y-2 text-sm">
                <span>Body</span>
                <Textarea
                  value={loginSettings.body}
                  maxLength={260}
                  rows={3}
                  onChange={(event) =>
                    updateLoginDraft({ body: event.target.value })
                  }
                />
              </label>
              <div className="grid gap-4 lg:grid-cols-2">
                {loginSettings.cards.slice(0, 2).map((card, index) => (
                  <div key={index} className="space-y-3 rounded-lg border p-4">
                    <div className="text-sm font-medium">
                      Feature Card {index + 1}
                    </div>
                    <Input
                      value={card.title}
                      maxLength={48}
                      onChange={(event) =>
                        updateLoginDraft({
                          cards: loginSettings.cards.map((entry, cardIndex) =>
                            cardIndex === index
                              ? { ...entry, title: event.target.value }
                              : entry,
                          ),
                        })
                      }
                    />
                    <Textarea
                      value={card.description}
                      maxLength={120}
                      rows={3}
                      onChange={(event) =>
                        updateLoginDraft({
                          cards: loginSettings.cards.map((entry, cardIndex) =>
                            cardIndex === index
                              ? {
                                  ...entry,
                                  description: event.target.value,
                                }
                              : entry,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <label className="space-y-2 text-sm">
                <span>Bullets</span>
                <Textarea
                  value={loginSettings.bullets.join("\n")}
                  rows={4}
                  onChange={(event) =>
                    updateLoginDraft({
                      bullets: event.target.value
                        .split("\n")
                        .map((entry) => entry.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <div className="flex justify-end">
                <Button
                  disabled={saving}
                  onClick={() => void saveLoginSettings()}
                >
                  Save Login Page
                </Button>
              </div>
            </div>
          ) : null}
        </TableContainer>
      </PageSection>
    </PageContainer>
  );
}

const loginMediaTypeOptions: Array<{
  value: LoginPageMediaType;
  label: string;
}> = [
  { value: "VIDEO", label: "Video" },
  { value: "IMAGE", label: "Image" },
  { value: "GIF", label: "GIF" },
];

const imageLimitOptions = ["10", "12", "15", "25", "50"].map((value) => ({
  value,
  label: `${value} MB`,
}));

const videoLimitOptions = ["50", "80", "100", "150"].map((value) => ({
  value,
  label: `${value} MB`,
}));

function LimitSelect({
  title,
  description,
  value,
  options,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  value: number;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border p-4 text-sm">
      <div>
        <div className="font-medium">{title}</div>
        <div className="mt-1 text-muted-foreground">{description}</div>
      </div>
      <ProductSelectMenu
        ariaLabel={`Select ${title.toLowerCase()} limit`}
        value={String(value)}
        options={options}
        onChange={(nextValue) => {
          if (!disabled) {
            onChange(Number(nextValue));
          }
        }}
      />
    </div>
  );
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  return "Platform settings could not be loaded.";
}
