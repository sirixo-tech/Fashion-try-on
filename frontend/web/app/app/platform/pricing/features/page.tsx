"use client";

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  CheckCircleIcon,
  RefreshCwIcon,
  SaveIcon,
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
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import {
  getCurrentPlatformAccess,
  type CurrentPlatformAccess,
} from "@/lib/access-control";
import {
  listPlanFeatures,
  updatePlanFeature,
  type PlanFeature,
} from "@/lib/pricing";
import { useSession } from "@/lib/session";

export default function PricingFeaturesPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [features, setFeatures] = useState<PlanFeature[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PlanFeature>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [platformAccess, setPlatformAccess] =
    useState<CurrentPlatformAccess | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);

  const canViewPricing = Boolean(
    platformAccess?.isSuperadmin ||
    platformAccess?.permissions.includes("PRICING_VIEW") ||
    platformAccess?.permissions.includes("PRICING_MANAGE"),
  );
  const canManagePricing = Boolean(
    platformAccess?.isSuperadmin ||
    platformAccess?.permissions.includes("PRICING_MANAGE"),
  );

  const load = useCallback(async () => {
    if (!accessToken || !canViewPricing) {
      setFeatures([]);
      setDrafts({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextFeatures = await listPlanFeatures(accessToken);
      setFeatures(nextFeatures);
      setDrafts(
        Object.fromEntries(
          nextFeatures.map((feature) => [feature.key, feature]),
        ),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, canViewPricing]);

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
    void load();
  }, [load]);

  async function saveFeature(featureKey: string) {
    const draft = drafts[featureKey];
    if (!accessToken || !canManagePricing || !draft) {
      return;
    }
    setSavingKey(featureKey);
    setError(null);
    setNotice(null);
    try {
      const saved = await updatePlanFeature(accessToken, featureKey, {
        displayName: draft.displayName,
        description: draft.description,
        group: draft.group,
        sortOrder: draft.sortOrder,
        active: draft.active,
      });
      setFeatures((current) =>
        current.map((feature) => (feature.key === saved.key ? saved : feature)),
      );
      setDrafts((current) => ({ ...current, [saved.key]: saved }));
      setNotice(`${saved.displayName} saved.`);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSavingKey(null);
    }
  }

  if (accessLoading) {
    return <LoadingState label="Checking pricing access" />;
  }

  if (!canViewPricing) {
    return (
      <div className="flex min-h-[calc(100dvh-3.75rem)] items-center justify-center p-4">
        <ErrorState
          title="Plan features are platform-only"
          description="Only SelfX platform roles can view or manage plan feature labels."
        />
      </div>
    );
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Platform"
        title="Plan Features"
        description="Edit customer-facing feature labels used on plans and billing pages. System keys stay fixed for entitlement checks."
        status={<Badge variant="secondary">{features.length} features</Badge>}
        actions={
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCwIcon aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      {error ? (
        <PageSection>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        </PageSection>
      ) : null}

      {notice ? (
        <PageSection>
          <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircleIcon size={18} aria-hidden="true" />
            {notice}
          </div>
        </PageSection>
      ) : null}

      <PageSection>
        {loading ? (
          <LoadingState label="Loading plan features" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {features.map((feature) => {
              const draft = drafts[feature.key] ?? feature;
              return (
                <Card key={feature.key}>
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <SparklesIcon aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="truncate text-lg">
                          {draft.displayName}
                        </CardTitle>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">
                          {feature.key}
                        </div>
                      </div>
                      <Badge variant={draft.active ? "default" : "secondary"}>
                        {draft.active ? "Active" : "Hidden"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <TextField
                      label="Display name"
                      value={draft.displayName}
                      disabled={!canManagePricing}
                      onChange={(displayName) =>
                        updateDraft(setDrafts, feature.key, { displayName })
                      }
                    />
                    <label className="grid gap-2 text-sm font-medium">
                      Description
                      <textarea
                        className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-muted"
                        value={draft.description ?? ""}
                        disabled={!canManagePricing}
                        placeholder="Short help text shown below this feature."
                        onChange={(event) =>
                          updateDraft(setDrafts, feature.key, {
                            description: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
                      <TextField
                        label="Group"
                        value={draft.group}
                        disabled={!canManagePricing}
                        onChange={(group) =>
                          updateDraft(setDrafts, feature.key, { group })
                        }
                      />
                      <label className="grid gap-2 text-sm font-medium">
                        Sort order
                        <input
                          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-muted"
                          type="number"
                          min="0"
                          step="1"
                          value={draft.sortOrder}
                          disabled={!canManagePricing}
                          onChange={(event) =>
                            updateDraft(setDrafts, feature.key, {
                              sortOrder: Number(event.target.value || "0"),
                            })
                          }
                        />
                      </label>
                    </div>
                    <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={draft.active}
                        disabled={!canManagePricing}
                        onChange={(event) =>
                          updateDraft(setDrafts, feature.key, {
                            active: event.target.checked,
                          })
                        }
                      />
                      <span>
                        <span className="block font-medium">
                          Available for plan assignment
                        </span>
                        <span className="block text-muted-foreground">
                          Hidden features stay in old plans but are not offered
                          for new assignments.
                        </span>
                      </span>
                    </label>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        disabled={
                          !canManagePricing || savingKey === feature.key
                        }
                        onClick={() => void saveFeature(feature.key)}
                      >
                        <SaveIcon aria-hidden="true" />
                        {savingKey === feature.key ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </PageSection>
    </PageContainer>
  );
}

function TextField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-muted"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function updateDraft(
  setDrafts: Dispatch<SetStateAction<Record<string, PlanFeature>>>,
  featureKey: string,
  input: Partial<PlanFeature>,
) {
  setDrafts((current) => ({
    ...current,
    [featureKey]: {
      ...current[featureKey],
      ...input,
    } as PlanFeature,
  }));
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  return "Plan features could not be loaded.";
}
