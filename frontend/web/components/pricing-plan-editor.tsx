"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CreditCardIcon,
  MonitorIcon,
  SaveIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
  PageSection,
  SelectMenu,
  buttonVariants,
  useToast,
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import {
  getCurrentPlatformAccess,
  type CurrentPlatformAccess,
} from "@/lib/access-control";
import { getPlatformVirtualTryOnSettings } from "@/lib/platform-settings";
import {
  createPricingPlan,
  listPlanFeatures,
  listPricingPlans,
  updatePricingPlan,
  type PlanFeature,
  type PricingPlan,
  type PricingPlanChannel,
  type PricingPlanInput,
  type PricingPlanStatus,
} from "@/lib/pricing";
import { useSession } from "@/lib/session";

const channelOptions: PricingPlanChannel[] = [
  "SHOPIFY",
  "WOOCOMMERCE",
  "KIOSK",
  "PUBLIC_API",
];

const statusOptions: Array<{ value: PricingPlanStatus; label: string }> = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "ARCHIVED", label: "Archived" },
];

const editorSections = [
  { id: "name", label: "Name & visibility" },
  { id: "pricing", label: "Pricing" },
  { id: "credits", label: "Credits" },
  { id: "channels", label: "Channels" },
  { id: "features", label: "Features" },
  { id: "kiosks", label: "Kiosks" },
] as const;

type PlanFormState = {
  code: string;
  name: string;
  status: PricingPlanStatus;
  channels: PricingPlanChannel[];
  currency: string;
  monthlyPrice: string;
  includedCredits: string;
  trialCredits: string;
  extraCreditPrice: string;
  kioskMonthlyRent: string;
  kioskDeviceLimit: string;
  featureKeys: string[];
};

const emptyForm: PlanFormState = {
  code: "",
  name: "",
  status: "ACTIVE",
  channels: ["SHOPIFY"],
  currency: "USD",
  monthlyPrice: "0",
  includedCredits: "1000",
  trialCredits: "10",
  extraCreditPrice: "",
  kioskMonthlyRent: "",
  kioskDeviceLimit: "",
  featureKeys: [],
};

export function PricingPlanEditor({
  mode,
  planId,
}: {
  mode: "create" | "edit";
  planId?: string;
}) {
  const router = useRouter();
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [form, setForm] = useState<PlanFormState>(emptyForm);
  const [loadedPlan, setLoadedPlan] = useState<PricingPlan | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platformAccess, setPlatformAccess] =
    useState<CurrentPlatformAccess | null>(null);
  const [features, setFeatures] = useState<PlanFeature[]>([]);
  const [accessLoading, setAccessLoading] = useState(true);
  const [platformCurrency, setPlatformCurrency] = useState(emptyForm.currency);
  const { showToast } = useToast();

  const canViewPricing = Boolean(
    platformAccess?.isSuperadmin ||
    platformAccess?.permissions.includes("PRICING_VIEW") ||
    platformAccess?.permissions.includes("PRICING_MANAGE"),
  );
  const canManagePricing = Boolean(
    platformAccess?.isSuperadmin ||
    platformAccess?.permissions.includes("PRICING_MANAGE"),
  );

  const loadPlan = useCallback(async () => {
    if (mode === "create") {
      setLoading(false);
      return;
    }
    if (!accessToken || !canViewPricing || !planId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const plans = await listPricingPlans(accessToken);
      const plan = plans.find((item) => item.id === planId) ?? null;
      setLoadedPlan(plan);
      if (plan) {
        setForm(formFromPlan(plan, platformCurrency));
      } else {
        setError("Pricing plan was not found.");
      }
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, canViewPricing, mode, planId, platformCurrency]);

  useEffect(() => {
    if (!accessToken) {
      setPlatformAccess(null);
      setAccessLoading(false);
      return;
    }
    let cancelled = false;
    setAccessLoading(true);
    getCurrentPlatformAccess(accessToken)
      .then((access) => {
        if (!cancelled) {
          setPlatformAccess(access);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlatformAccess({ isSuperadmin: false, permissions: [] });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAccessLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    if (!accessToken || !canViewPricing) {
      setFeatures([]);
      return;
    }
    let cancelled = false;
    listPlanFeatures(accessToken)
      .then((nextFeatures) => {
        if (!cancelled) {
          setFeatures(nextFeatures);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFeatures([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, canViewPricing]);

  useEffect(() => {
    if (!accessToken || !canViewPricing) {
      return;
    }
    let cancelled = false;
    getPlatformVirtualTryOnSettings(accessToken)
      .then((settings) => {
        if (cancelled) {
          return;
        }
        const defaultCurrency = normalizeCurrency(settings.defaultCurrency);
        setPlatformCurrency(defaultCurrency);
        setForm((current) => ({ ...current, currency: defaultCurrency }));
      })
      .catch(() => {
        if (!cancelled) {
          setPlatformCurrency(emptyForm.currency);
          setForm((current) => ({
            ...current,
            currency: normalizeCurrency(current.currency),
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, canViewPricing]);

  const title = mode === "create" ? "New plan" : "Edit plan";
  const previewTitle = form.name.trim() || "Untitled plan";
  const channelSummary = useMemo(
    () => form.channels.map(channelLabel).join(", "),
    [form.channels],
  );
  const selectedFeatures = useMemo(
    () => labelsForFeatureKeys(form.featureKeys, features),
    [features, form.featureKeys],
  );
  const generatedPlanCode = useMemo(
    () => planCodeFromName(form.name),
    [form.name],
  );

  async function savePlan() {
    if (!accessToken || !canManagePricing) {
      return;
    }
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = formToInput({ ...form, currency: platformCurrency });
      const generatedCode =
        mode === "create"
          ? uniquePlanCode(
              generatedPlanCode,
              await listPricingPlans(accessToken).catch(() => []),
            )
          : form.code.trim();
      const saved =
        mode === "create"
          ? await createPricingPlan(accessToken, {
              ...payload,
              code: generatedCode,
            })
          : await updatePricingPlan(accessToken, planId ?? "", payload);
      setLoadedPlan(saved);
      setForm(formFromPlan(saved, platformCurrency));
      showToast({
        variant: "success",
        title: mode === "create" ? "Plan created" : "Plan saved",
        description: `${saved.name} ${
          mode === "create" ? "created" : "updated"
        } successfully.`,
      });
      if (mode === "create") {
        router.replace(`/app/platform/pricing/${saved.id}/edit`);
      }
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  if (accessLoading) {
    return <LoadingState label="Checking pricing access" />;
  }

  if (!canViewPricing) {
    return (
      <div className="flex min-h-[calc(100dvh-3.75rem)] items-center justify-center p-4">
        <ErrorState
          title="Plans are platform-only"
          description="Only SelfX platform roles can view or manage pricing plans."
        />
      </div>
    );
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Platform"
        title={title}
        description={
          mode === "create"
            ? "Create a plan once, then assign it manually to Store accounts."
            : "Update pricing, credits, channels and kiosk rental controls."
        }
        status={<Badge variant="secondary">{form.status}</Badge>}
        actions={
          <>
            <Link
              href="/app/platform/pricing"
              className={buttonVariants({ variant: "outline" })}
            >
              <ArrowLeftIcon aria-hidden="true" />
              Plans
            </Link>
            <Button
              type="button"
              disabled={saving || !canManagePricing}
              onClick={() => void savePlan()}
            >
              <SaveIcon aria-hidden="true" />
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </>
        }
      />

      {error ? (
        <PageSection>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        </PageSection>
      ) : null}

      <PageSection>
        {loading ? (
          <LoadingState label="Loading pricing plan" />
        ) : mode === "edit" && !loadedPlan ? (
          <ErrorState
            title="Plan unavailable"
            description="SelfX could not find that pricing plan."
            action={{ label: "Back to plans", href: "/app/platform/pricing" }}
          />
        ) : (
          <form
            className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)_22rem]"
            onSubmit={(event) => {
              event.preventDefault();
              void savePlan();
            }}
          >
            <aside className="h-fit rounded-lg border bg-card p-3 lg:sticky lg:top-6">
              <div className="px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                On this page
              </div>
              <nav className="grid gap-1">
                {editorSections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {section.label}
                  </a>
                ))}
              </nav>
            </aside>

            <div className="grid gap-6">
              <Card id="name">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <SectionIcon icon={<CreditCardIcon aria-hidden="true" />} />
                    <div>
                      <CardTitle>Name & visibility</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Choose the public name and availability state for this
                        plan.
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <TextField
                    label="Plan name"
                    value={form.name}
                    disabled={!canManagePricing}
                    placeholder="Shopify Starter"
                    onChange={(name) =>
                      setForm((current) => ({ ...current, name }))
                    }
                  />
                  <label className="grid gap-2 text-sm font-medium">
                    Status
                    <SelectMenu
                      ariaLabel="Plan status"
                      value={form.status}
                      options={statusOptions}
                      disabled={!canManagePricing}
                      onChange={(status) =>
                        setForm((current) => ({ ...current, status }))
                      }
                    />
                  </label>
                  {mode === "edit" ? (
                    <div className="grid gap-3 rounded-md border bg-muted/25 p-3">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                          Internal details
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          This code was generated when the plan was created and
                          stays stable for integrations, billing and analytics.
                        </p>
                      </div>
                      <ReadOnlyField label="Plan code" value={form.code} />
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card id="pricing">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <SectionIcon icon={<CreditCardIcon aria-hidden="true" />} />
                    <div>
                      <CardTitle>Pricing</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Uses the currency saved in Platform Settings for every
                        pricing plan.
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium">
                    Currency
                    <div className="flex h-12 items-center rounded-md border border-input bg-muted/40 px-3 text-base font-semibold">
                      {platformCurrency}
                    </div>
                    <span className="text-xs font-normal text-muted-foreground">
                      Inherited from Platform Settings.
                    </span>
                  </label>
                  <NumberField
                    label="Monthly price"
                    value={form.monthlyPrice}
                    disabled={!canManagePricing}
                    onChange={(monthlyPrice) =>
                      setForm((current) => ({ ...current, monthlyPrice }))
                    }
                  />
                  <NumberField
                    label="Extra credit price"
                    value={form.extraCreditPrice}
                    disabled={!canManagePricing}
                    placeholder="Optional"
                    onChange={(extraCreditPrice) =>
                      setForm((current) => ({ ...current, extraCreditPrice }))
                    }
                  />
                </CardContent>
              </Card>

              <Card id="credits">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <SectionIcon icon={<SparklesIcon aria-hidden="true" />} />
                    <div>
                      <CardTitle>Credits</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Control included monthly Try-On credits and free trial
                        credits.
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label="Included credits"
                    value={form.includedCredits}
                    step="1"
                    disabled={!canManagePricing}
                    onChange={(includedCredits) =>
                      setForm((current) => ({ ...current, includedCredits }))
                    }
                  />
                  <NumberField
                    label="Trial credits"
                    value={form.trialCredits}
                    step="1"
                    disabled={!canManagePricing}
                    onChange={(trialCredits) =>
                      setForm((current) => ({ ...current, trialCredits }))
                    }
                  />
                </CardContent>
              </Card>

              <Card id="channels">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <SectionIcon icon={<SettingsIcon aria-hidden="true" />} />
                    <div>
                      <CardTitle>Channels</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Decide where this plan can be offered or manually
                        assigned.
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ChannelPicker
                    value={form.channels}
                    disabled={!canManagePricing}
                    onChange={(channels) =>
                      setForm((current) => ({ ...current, channels }))
                    }
                  />
                </CardContent>
              </Card>

              <Card id="features">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <SectionIcon icon={<SparklesIcon aria-hidden="true" />} />
                    <div>
                      <CardTitle>Features</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Assign the real SelfX capabilities included in this
                        plan. These labels appear as customer-facing plan
                        bullets.
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <FeaturePicker
                    features={features.filter((feature) => feature.active)}
                    value={form.featureKeys}
                    disabled={!canManagePricing}
                    onChange={(featureKeys) =>
                      setForm((current) => ({ ...current, featureKeys }))
                    }
                  />
                </CardContent>
              </Card>

              <Card id="kiosks">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <SectionIcon icon={<MonitorIcon aria-hidden="true" />} />
                    <div>
                      <CardTitle>Kiosks</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Add kiosk rental pricing and device limits for kiosk
                        plans.
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label="Kiosk monthly rent"
                    value={form.kioskMonthlyRent}
                    disabled={!canManagePricing}
                    placeholder="Optional"
                    onChange={(kioskMonthlyRent) =>
                      setForm((current) => ({ ...current, kioskMonthlyRent }))
                    }
                  />
                  <NumberField
                    label="Kiosk device limit"
                    value={form.kioskDeviceLimit}
                    step="1"
                    disabled={!canManagePricing}
                    placeholder="Blank means unlimited"
                    onChange={(kioskDeviceLimit) =>
                      setForm((current) => ({ ...current, kioskDeviceLimit }))
                    }
                  />
                </CardContent>
              </Card>
            </div>

            <aside className="h-fit rounded-lg border bg-card lg:sticky lg:top-6">
              <div className="border-b bg-primary p-4 text-primary-foreground">
                <div className="text-xs font-bold uppercase opacity-80">
                  Preview
                </div>
                <div className="mt-2 text-xl font-semibold">{previewTitle}</div>
                <div className="mt-2">
                  <Badge variant="secondary">{form.status}</Badge>
                </div>
              </div>
              <div className="grid gap-4 p-4">
                <PreviewMetric
                  label="Monthly"
                  value={moneyInputLabel(form.monthlyPrice, form.currency)}
                />
                <PreviewMetric
                  label="Credits"
                  value={`${numberInputLabel(form.includedCredits)} / month`}
                />
                <PreviewMetric
                  label="Trial"
                  value={`${numberInputLabel(form.trialCredits)} credits`}
                />
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Channels
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {channelSummary}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Features
                  </div>
                  {selectedFeatures.length === 0 ? (
                    <div className="mt-1 text-sm text-muted-foreground">
                      No features selected.
                    </div>
                  ) : (
                    <ul className="mt-2 grid gap-2 text-sm">
                      {selectedFeatures.slice(0, 6).map((feature) => (
                        <li
                          key={feature.key}
                          className="flex items-start gap-2"
                        >
                          <CheckCircle2Icon
                            size={16}
                            aria-hidden="true"
                            className="mt-0.5 shrink-0 text-emerald-600"
                          />
                          <span>{feature.displayName}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {selectedFeatures.length > 6 ? (
                    <div className="mt-2 text-xs font-medium text-primary">
                      +{selectedFeatures.length - 6} more
                    </div>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  disabled={saving || !canManagePricing}
                  className="w-full"
                >
                  <SaveIcon aria-hidden="true" />
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </aside>
          </form>
        )}
      </PageSection>
    </PageContainer>
  );
}

function SectionIcon({ icon }: { icon: ReactNode }) {
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
      {icon}
    </span>
  );
}

function TextField({
  label,
  value,
  maxLength,
  disabled,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  maxLength?: number;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-muted"
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2 text-sm font-medium">
      {label}
      <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
        {value}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  step = "0.01",
  disabled,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  step?: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-muted"
        type="number"
        min="0"
        step={step}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ChannelPicker({
  value,
  disabled,
  onChange,
}: {
  value: PricingPlanChannel[];
  disabled?: boolean;
  onChange: (value: PricingPlanChannel[]) => void;
}) {
  return (
    <fieldset className="grid gap-3">
      <legend className="sr-only">Channels</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {channelOptions.map((channel) => (
          <label
            key={channel}
            className={[
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm font-medium transition-[background-color,border-color,box-shadow,transform]",
              value.includes(channel)
                ? "border-primary/80 bg-primary/5 ring-1 ring-primary/20 hover:border-primary hover:ring-primary/30"
                : "border-border bg-muted/20 hover:border-foreground/25 hover:shadow-soft",
              disabled
                ? "cursor-not-allowed opacity-60 hover:shadow-none motion-safe:hover:translate-y-0 motion-safe:hover:scale-100"
                : "motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-[1.01]",
            ].join(" ")}
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={value.includes(channel)}
              disabled={disabled}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...value, channel]
                  : value.filter((item) => item !== channel);
                onChange(next.length > 0 ? next : value);
              }}
            />
            <span>
              <span className="block">{channelLabel(channel)}</span>
              <span className="block text-xs font-normal text-muted-foreground">
                {channelDescription(channel)}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function FeaturePicker({
  features,
  value,
  disabled,
  onChange,
}: {
  features: PlanFeature[];
  value: string[];
  disabled?: boolean;
  onChange: (featureKeys: string[]) => void;
}) {
  if (features.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        No plan features are available yet.
      </div>
    );
  }
  const grouped = groupFeatures(features);
  const selected = new Set(value);
  return (
    <div className="grid gap-5">
      {grouped.map(([group, groupFeatures]) => {
        const groupKeys = groupFeatures.map((feature) => feature.key);
        const allSelected = groupKeys.every((key) => selected.has(key));
        return (
          <div key={group} className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {group}
              </h3>
              <button
                type="button"
                className="text-xs font-medium text-primary disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled}
                onClick={() => {
                  onChange(
                    allSelected
                      ? value.filter((key) => !groupKeys.includes(key))
                      : Array.from(new Set([...value, ...groupKeys])),
                  );
                }}
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {groupFeatures.map((feature) => {
                const checked = selected.has(feature.key);
                return (
                  <label
                    key={feature.key}
                    className={[
                      "grid cursor-pointer gap-2 rounded-lg border p-4 text-sm transition-[background-color,border-color,box-shadow,transform]",
                      checked
                        ? "border-primary/80 bg-primary/5 ring-1 ring-primary/20 hover:border-primary hover:ring-primary/30"
                        : "border-border bg-background hover:border-foreground/25 hover:shadow-soft",
                      disabled
                        ? "cursor-not-allowed opacity-60 hover:shadow-none motion-safe:hover:translate-y-0 motion-safe:hover:scale-100"
                        : "motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-[1.01]",
                    ].join(" ")}
                  >
                    <span className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        disabled={disabled}
                        onChange={(event) => {
                          onChange(
                            event.target.checked
                              ? [...value, feature.key]
                              : value.filter((key) => key !== feature.key),
                          );
                        }}
                      />
                      <span>
                        <span className="block font-semibold">
                          {feature.displayName}
                        </span>
                        {feature.description ? (
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                            {feature.description}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold">{value}</div>
    </div>
  );
}

function formFromPlan(
  plan: PricingPlan,
  platformCurrency = plan.currency,
): PlanFormState {
  return {
    code: plan.code,
    name: plan.name,
    status: plan.status,
    channels: plan.channels,
    currency: normalizeCurrency(platformCurrency),
    monthlyPrice: centsToMoneyInput(plan.monthlyPriceCents),
    includedCredits: String(plan.includedCredits),
    trialCredits: String(plan.trialCredits),
    extraCreditPrice:
      plan.extraCreditPriceCents === null
        ? ""
        : centsToMoneyInput(plan.extraCreditPriceCents),
    kioskMonthlyRent:
      plan.kioskMonthlyRentCents === null
        ? ""
        : centsToMoneyInput(plan.kioskMonthlyRentCents),
    kioskDeviceLimit:
      plan.kioskDeviceLimit === null ? "" : String(plan.kioskDeviceLimit),
    featureKeys: plan.featureKeys ?? [],
  };
}

function formToInput(form: PlanFormState): PricingPlanInput {
  return {
    name: form.name.trim(),
    status: form.status,
    channels: form.channels,
    currency: form.currency.trim().toUpperCase(),
    monthlyPriceCents: moneyInputToCents(form.monthlyPrice),
    includedCredits: integerInput(form.includedCredits),
    trialCredits: integerInput(form.trialCredits),
    extraCreditPriceCents: optionalMoneyInputToCents(form.extraCreditPrice),
    kioskMonthlyRentCents: optionalMoneyInputToCents(form.kioskMonthlyRent),
    kioskDeviceLimit: optionalIntegerInput(form.kioskDeviceLimit),
    featureKeys: form.featureKeys,
  };
}

function planCodeFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  const code = slug || "plan";
  const validLengthCode = code.length < 3 ? `${code}-plan` : code;
  return validLengthCode.slice(0, 80).replace(/-+$/g, "") || "plan";
}

function uniquePlanCode(baseCode: string, existingPlans: PricingPlan[]): string {
  const existingCodes = new Set(existingPlans.map((plan) => plan.code));
  if (!existingCodes.has(baseCode)) {
    return baseCode;
  }
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const suffixText = String(suffix);
    const prefix =
      baseCode.slice(0, 79 - suffixText.length).replace(/-+$/g, "") || "plan";
    const candidate = `${prefix}-${suffixText}`;
    if (!existingCodes.has(candidate)) {
      return candidate;
    }
  }
  const fallbackSuffix = Date.now().toString(36);
  const fallbackPrefix =
    baseCode.slice(0, 79 - fallbackSuffix.length).replace(/-+$/g, "") ||
    "plan";
  return `${fallbackPrefix}-${fallbackSuffix}`;
}

function normalizeCurrency(value: unknown): string {
  const currency = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : emptyForm.currency;
}

function validateForm(form: PlanFormState): string | null {
  if (form.name.trim().length < 2) {
    return "Plan name must be at least 2 characters.";
  }
  if (!/^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())) {
    return "Currency must be a 3-letter code like USD or INR.";
  }
  return null;
}

function moneyInputToCents(value: string): number {
  return Math.round(Number(value || "0") * 100);
}

function optionalMoneyInputToCents(value: string): number | null {
  return value.trim() === "" ? null : moneyInputToCents(value);
}

function integerInput(value: string): number {
  return Math.max(0, Math.trunc(Number(value || "0")));
}

function optionalIntegerInput(value: string): number | null {
  return value.trim() === "" ? null : integerInput(value);
}

function centsToMoneyInput(value: number): string {
  return (value / 100).toFixed(2);
}

function moneyInputLabel(value: string, currency: string): string {
  return money(moneyInputToCents(value), currency || "USD");
}

function numberInputLabel(value: string): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    integerInput(value),
  );
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(value / 100);
}

function labelsForFeatureKeys(
  featureKeys: string[],
  features: PlanFeature[],
): PlanFeature[] {
  const featureMap = new Map(features.map((feature) => [feature.key, feature]));
  return featureKeys
    .map((key) => featureMap.get(key))
    .filter((feature): feature is PlanFeature => Boolean(feature));
}

function groupFeatures(
  features: PlanFeature[],
): Array<[string, PlanFeature[]]> {
  const groups = new Map<string, PlanFeature[]>();
  for (const feature of [...features].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.displayName.localeCompare(right.displayName),
  )) {
    const group = feature.group || "Core";
    groups.set(group, [...(groups.get(group) ?? []), feature]);
  }
  return Array.from(groups.entries());
}

function channelLabel(channel: string): string {
  return channel.replace("_", " ");
}

function channelDescription(channel: PricingPlanChannel): string {
  if (channel === "SHOPIFY") return "Shopify storefront Try-On.";
  if (channel === "WOOCOMMERCE") return "WooCommerce storefront Try-On.";
  if (channel === "KIOSK") return "Physical kiosk deployments.";
  return "Public API and partner integrations.";
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    if (caught.code === "PRICING_PLAN_CODE_CONFLICT") {
      return "A plan with a matching generated code already exists. Change the plan name slightly and try again.";
    }
    return caught.message;
  }
  if (caught instanceof Error) {
    return caught.message;
  }
  return "Pricing plan could not be saved.";
}
