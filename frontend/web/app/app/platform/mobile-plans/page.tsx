"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
  PageSection,
  SelectMenu,
  buttonVariants,
} from "@selfx/ui";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { CustomCreditPlanCard } from "@/components/custom-credit-plan-card";
import {
  getCustomCreditPlan,
  type CustomCreditPlan,
} from "@/lib/custom-credit-plans";
import {
  listMobilePlans,
  updateMobilePlan,
  type MobilePlan,
  type MobilePlanStatus,
} from "@/lib/mobile-plans";
import { useSession } from "@/lib/session";

export default function MobilePlansPage() {
  const session = useSession();
  const token = session.status === "authenticated" ? session.accessToken : null;
  const [permissions, setPermissions] = useState<{
    view: boolean;
    manage: boolean;
  } | null>(null);
  const [plans, setPlans] = useState<MobilePlan[]>([]);
  const [statusFilter, setStatusFilter] = useState<MobilePlanStatus | "ALL">(
    "ALL",
  );
  const [changingPlanId, setChangingPlanId] = useState<string | null>(null);
  const [customPlan, setCustomPlan] = useState<CustomCreditPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const access = await getCurrentPlatformAccess(token);
      const view =
        access.isSuperadmin ||
        access.permissions.includes("PRICING_VIEW") ||
        access.permissions.includes("PRICING_MANAGE");
      const manage =
        access.isSuperadmin || access.permissions.includes("PRICING_MANAGE");
      setPermissions({ view, manage });
      if (view) {
        const [regular, custom] = await Promise.all([
          listMobilePlans(token),
          getCustomCreditPlan(token, "MOBILE"),
        ]);
        setPlans(regular);
        setCustomPlan(custom);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Mobile plans could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changePlanStatus(plan: MobilePlan, status: MobilePlanStatus) {
    if (!token || !permissions?.manage || plan.status === status) return;
    setChangingPlanId(plan.id);
    setError(null);
    try {
      const updated = await updateMobilePlan(token, plan.id, { status });
      setPlans((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Plan status could not be changed.",
      );
    } finally {
      setChangingPlanId(null);
    }
  }

  if (loading && !permissions)
    return <LoadingState label="Checking mobile plan access" />;
  if (!permissions)
    return (
      <ErrorState
        title="Mobile Plans unavailable"
        description={error ?? "Pricing access could not be checked."}
      />
    );
  if (!permissions.view)
    return (
      <ErrorState
        title="Mobile Plans are platform-only"
        description="Pricing access is required to view mobile plans."
      />
    );

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Platform"
        title="Mobile Plans"
        description="Create plans for personal mobile Try-On."
        status={
          <Badge variant="secondary">
            {plans.length + (customPlan ? 1 : 0)} plans
          </Badge>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            {permissions.manage && (
              <Link
                href="/app/platform/mobile-plans/new"
                className={buttonVariants({ variant: "default" })}
              >
                <PlusIcon aria-hidden="true" />
                New mobile plan
              </Link>
            )}
          </>
        }
      />
      {error && (
        <PageSection>
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {error}
          </div>
        </PageSection>
      )}
      <PageSection>
        <div className="mb-4 flex justify-end">
          <SelectMenu
            ariaLabel="Mobile plan status"
            value={statusFilter}
            options={[
              { value: "ALL", label: "All plans" },
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
              { value: "ARCHIVED", label: "Archived" },
            ]}
            className="min-w-40"
            onChange={setStatusFilter}
          />
        </div>
        {loading ? (
          <LoadingState label="Loading mobile plans" />
        ) : plans.filter(
            (plan) => statusFilter === "ALL" || plan.status === statusFilter,
          ).length === 0 &&
          !(
            customPlan &&
            (statusFilter === "ALL" || customPlan.status === statusFilter)
          ) ? (
          <div className="rounded-lg border p-8 text-center text-muted-foreground">
            {plans.length === 0 && !customPlan
              ? "No mobile plans yet."
              : "No mobile plans with this status."}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {customPlan &&
              (statusFilter === "ALL" ||
                customPlan.status === statusFilter) && (
                <CustomCreditPlanCard
                  plan={customPlan}
                  canManage={permissions.manage}
                />
              )}
            {plans
              .filter(
                (plan) =>
                  statusFilter === "ALL" || plan.status === statusFilter,
              )
              .map((plan) => (
                <Card key={plan.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle>{plan.name}</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {plan.code}
                        </p>
                      </div>
                      <Badge
                        variant={
                          plan.status === "ACTIVE" ? "default" : "secondary"
                        }
                      >
                        {plan.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm">
                    {plan.description && (
                      <p className="text-muted-foreground">
                        {plan.description}
                      </p>
                    )}
                    <p className="text-xl font-semibold">
                      {new Intl.NumberFormat(undefined, {
                        style: "currency",
                        currency: plan.currency,
                      }).format(plan.priceCents / 100)}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        {plan.billingPeriod === "MONTHLY"
                          ? "/ month"
                          : "one-time"}
                      </span>
                    </p>
                    <p>
                      {plan.includedCredits} Try-On credits
                      {plan.trialCredits > 0
                        ? ` · ${plan.trialCredits} intro trial credits`
                        : ""}
                    </p>
                    {permissions.manage && (
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/app/platform/mobile-plans/${plan.id}/edit`}
                          className={buttonVariants({ variant: "outline" })}
                        >
                          <PencilIcon aria-hidden="true" /> Edit
                        </Link>
                        <ConfirmDialog
                          title={
                            plan.status === "ARCHIVED"
                              ? "Reactivate mobile plan?"
                              : "Archive mobile plan?"
                          }
                          description={
                            plan.status === "ARCHIVED"
                              ? "The plan will be available for mobile purchases again."
                              : "The plan will be hidden from new purchases while purchase history is retained."
                          }
                          confirmLabel={
                            plan.status === "ARCHIVED"
                              ? "Reactivate"
                              : "Archive"
                          }
                          destructive={plan.status !== "ARCHIVED"}
                          onConfirm={() =>
                            changePlanStatus(
                              plan,
                              plan.status === "ARCHIVED"
                                ? "ACTIVE"
                                : "ARCHIVED",
                            )
                          }
                          trigger={
                            <Button
                              variant="outline"
                              disabled={changingPlanId === plan.id}
                            >
                              {plan.status === "ARCHIVED" ? (
                                <RefreshCwIcon aria-hidden="true" />
                              ) : (
                                <Trash2Icon aria-hidden="true" />
                              )}
                              {plan.status === "ARCHIVED"
                                ? "Reactivate"
                                : "Archive"}
                            </Button>
                          }
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </PageSection>
    </PageContainer>
  );
}
