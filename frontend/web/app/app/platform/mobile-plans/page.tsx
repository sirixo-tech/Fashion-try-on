"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PencilIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
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
  buttonVariants,
} from "@selfx/ui";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { CustomCreditPlanCard } from "@/components/custom-credit-plan-card";
import {
  getCustomCreditPlan,
  type CustomCreditPlan,
} from "@/lib/custom-credit-plans";
import { listMobilePlans, type MobilePlan } from "@/lib/mobile-plans";
import { useSession } from "@/lib/session";

export default function MobilePlansPage() {
  const session = useSession();
  const token = session.status === "authenticated" ? session.accessToken : null;
  const [permissions, setPermissions] = useState<{
    view: boolean;
    manage: boolean;
  } | null>(null);
  const [plans, setPlans] = useState<MobilePlan[]>([]);
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
        {loading ? (
          <LoadingState label="Loading mobile plans" />
        ) : plans.length === 0 && !customPlan ? (
          <div className="rounded-lg border p-8 text-center text-muted-foreground">
            No mobile plans yet.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {customPlan && (
              <CustomCreditPlanCard
                plan={customPlan}
                canManage={permissions.manage}
              />
            )}
            {plans.map((plan) => (
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
                    <p className="text-muted-foreground">{plan.description}</p>
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
                    <Link
                      href={`/app/platform/mobile-plans/${plan.id}/edit`}
                      className={buttonVariants({ variant: "outline" })}
                    >
                      <PencilIcon aria-hidden="true" />
                      Edit
                    </Link>
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
