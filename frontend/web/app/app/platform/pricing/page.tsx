"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArchiveIcon,
  CheckCircle2Icon,
  CreditCardIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
  StoreIcon,
  Trash2Icon,
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
  PageSection,
  buttonVariants,
  useToast,
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import {
  getCurrentPlatformAccess,
  type CurrentPlatformAccess,
} from "@/lib/access-control";
import {
  listPlanFeatures,
  listPricingPlans,
  updatePricingPlan,
  type PlanFeature,
  type PricingPlan,
} from "@/lib/pricing";
import { useSession } from "@/lib/session";

export default function PricingControlPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [features, setFeatures] = useState<PlanFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [archivingPlanId, setArchivingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [platformAccess, setPlatformAccess] =
    useState<CurrentPlatformAccess | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
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

  const loadPlans = useCallback(async () => {
    if (!accessToken || !canViewPricing) {
      setPlans([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextPlans, nextFeatures] = await Promise.all([
        listPricingPlans(accessToken),
        listPlanFeatures(accessToken),
      ]);
      setPlans(nextPlans);
      setFeatures(nextFeatures);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, canViewPricing]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

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

  async function archivePlan(plan: PricingPlan) {
    if (!accessToken || !canManagePricing || plan.status === "ARCHIVED") {
      return;
    }
    setArchivingPlanId(plan.id);
    setError(null);
    try {
      const archived = await updatePricingPlan(accessToken, plan.id, {
        status: "ARCHIVED",
      });
      setPlans((current) =>
        current.map((item) => (item.id === archived.id ? archived : item)),
      );
      showToast({
        variant: "success",
        title: "Plan archived",
        description: `${archived.name} archived successfully.`,
      });
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setArchivingPlanId(null);
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
        title="Plans"
        description="Central plan, credit and kiosk rental configuration."
        status={<Badge variant="secondary">{plans.length} plans</Badge>}
        actions={
          <>
            <Link
              href="/app/platform/pricing/features"
              className={buttonVariants({ variant: "outline" })}
            >
              <SparklesIcon aria-hidden="true" />
              Feature labels
            </Link>
            <Button variant="outline" onClick={() => void loadPlans()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            {canManagePricing ? (
              <Link
                href="/app/platform/pricing/new"
                className={buttonVariants({ variant: "default" })}
              >
                <PlusIcon aria-hidden="true" />
                New plan
              </Link>
            ) : (
              <Button variant="secondary" disabled>
                <PlusIcon aria-hidden="true" />
                New plan
              </Button>
            )}
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
          <LoadingState label="Loading pricing plans" />
        ) : plans.length === 0 ? (
          <EmptyState
            title="No pricing plans yet"
            description="Create the first plan to control Try-On credits, trial credits, supported channels and kiosk rental limits."
            action={
              canManagePricing
                ? {
                    label: "New plan",
                    href: "/app/platform/pricing/new",
                  }
                : undefined
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <PricingPlanCard
                key={plan.id}
                plan={plan}
                features={features}
                canManage={canManagePricing}
                archiving={archivingPlanId === plan.id}
                onArchive={() => void archivePlan(plan)}
              />
            ))}
          </div>
        )}
      </PageSection>
    </PageContainer>
  );
}

function PricingPlanCard({
  plan,
  features,
  canManage,
  archiving,
  onArchive,
}: {
  plan: PricingPlan;
  features: PlanFeature[];
  canManage: boolean;
  archiving: boolean;
  onArchive: () => void;
}) {
  const archived = plan.status === "ARCHIVED";
  const featureLabels = labelsForFeatureKeys(plan.featureKeys, features);

  return (
    <Card className={archived ? "opacity-70" : undefined}>
      <CardHeader className="gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <CreditCardIcon aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-lg">{plan.name}</CardTitle>
            <div className="truncate text-xs text-muted-foreground">
              {plan.code}
            </div>
          </div>
        </div>
        <CardAction>
          <Badge variant={plan.status === "ACTIVE" ? "default" : "secondary"}>
            {plan.status}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <PlanMetric
            label="Monthly"
            value={money(plan.monthlyPriceCents, plan.currency)}
          />
          <PlanMetric
            label="Credits"
            value={number(plan.includedCredits)}
            meta={`${number(plan.trialCredits)} trial`}
          />
        </div>

        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <SparklesIcon size={16} aria-hidden="true" />
            Channels
          </div>
          <div className="flex flex-wrap gap-2">
            {plan.channels.map((channel) => (
              <Badge key={channel} variant="secondary">
                {channelLabel(channel)}
              </Badge>
            ))}
          </div>
        </div>

        <div className="grid gap-2 text-sm">
          <PlanDetail
            label="Extra credit"
            value={
              plan.extraCreditPriceCents === null
                ? "-"
                : money(plan.extraCreditPriceCents, plan.currency)
            }
          />
          <PlanDetail
            label="Kiosk rent"
            value={
              plan.kioskMonthlyRentCents === null
                ? "-"
                : `${money(plan.kioskMonthlyRentCents, plan.currency)} / month`
            }
          />
          <PlanDetail
            label="Kiosk devices"
            value={
              plan.kioskDeviceLimit === null
                ? "Unlimited"
                : number(plan.kioskDeviceLimit)
            }
          />
        </div>

        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Included features
          </div>
          {featureLabels.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No features assigned yet.
            </div>
          ) : (
            <ul className="grid gap-2 text-sm">
              {featureLabels.slice(0, 5).map((label) => (
                <li key={label} className="flex items-start gap-2">
                  <CheckCircle2Icon
                    size={16}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-emerald-600"
                  />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          )}
          {featureLabels.length > 5 ? (
            <div className="mt-2 text-xs font-medium text-primary">
              +{featureLabels.length - 5} more
            </div>
          ) : null}
        </div>
      </CardContent>

      <CardFooter className="justify-between gap-3">
        <div
          className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"
          title={`Updated ${formatDate(plan.updatedAt)}`}
        >
          <StoreIcon size={15} aria-hidden="true" className="shrink-0" />
          <span className="truncate">
            {number(plan.assignedStoreCount)}{" "}
            {plan.assignedStoreCount === 1 ? "store" : "stores"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/app/platform/pricing/${plan.id}/edit`}
            aria-label={`Edit ${plan.name}`}
            title="Edit plan"
            className={buttonVariants({ variant: "outline", size: "icon-sm" })}
          >
            <PencilIcon aria-hidden="true" />
          </Link>
          <ConfirmDialog
            title="Archive plan?"
            description={`${plan.name} will be hidden from available plan lists, but kept for reporting and historical subscriptions.`}
            confirmLabel="Archive"
            destructive
            onConfirm={onArchive}
            trigger={
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`Archive ${plan.name}`}
                title={archived ? "Already archived" : "Archive plan"}
                disabled={!canManage || archived || archiving}
              >
                {archived ? (
                  <ArchiveIcon aria-hidden="true" />
                ) : (
                  <Trash2Icon aria-hidden="true" />
                )}
              </Button>
            }
          />
        </div>
      </CardFooter>
    </Card>
  );
}

function labelsForFeatureKeys(
  featureKeys: string[],
  features: PlanFeature[],
): string[] {
  const labels = new Map(
    features.map((feature) => [feature.key, feature.displayName]),
  );
  return featureKeys.map((key) => labels.get(key) ?? key);
}

function PlanMetric({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate text-lg font-semibold">{value}</div>
      {meta ? (
        <div className="text-xs text-muted-foreground">{meta}</div>
      ) : null}
    </div>
  );
}

function PlanDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function channelLabel(channel: string): string {
  return channel.replace("_", " ");
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(value / 100);
}

function number(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value,
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  if (caught instanceof Error) {
    return caught.message;
  }
  return "Pricing plans could not be loaded.";
}
