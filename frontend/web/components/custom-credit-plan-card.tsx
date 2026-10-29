"use client";

import Link from "next/link";
import { CreditCardIcon, PencilIcon } from "lucide-react";
import {
  Badge,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  buttonVariants,
} from "@selfx/ui";
import type { CustomCreditPlan } from "@/lib/custom-credit-plans";

export function CustomCreditPlanCard({
  plan,
  canManage,
}: {
  plan: CustomCreditPlan;
  canManage: boolean;
}) {
  const href = "/app/platform/mobile-plans/custom";
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-start gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <CreditCardIcon aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-lg">{plan.name}</CardTitle>
            <p className="text-xs text-muted-foreground">
              Custom credits · Mobile
            </p>
          </div>
          <Badge variant={plan.status === "ACTIVE" ? "default" : "secondary"}>
            {plan.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="rounded-lg border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Per credit
          </p>
          <p className="text-xl font-semibold">
            {new Intl.NumberFormat(undefined, {
              style: "currency",
              currency: plan.currency,
            }).format(plan.unitPriceCents / 100)}
          </p>
        </div>
        <p>Choose 1–1,000 credits at this price.</p>
      </CardContent>
      <CardFooter className="border-t pt-4">
        {canManage && (
          <Link href={href} className={buttonVariants({ variant: "outline" })}>
            <PencilIcon aria-hidden="true" /> Edit plan
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}
