"use client";

import Link from "next/link";
import { ArrowRightIcon, CreditCardIcon, Layers3Icon } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageContainer,
  PageHeader,
  PageSection,
  buttonVariants,
} from "@selfx/ui";

export function PlanTypeChooser() {
  const root = "/app/platform/mobile-plans";
  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Platform"
        title="New Mobile plan"
        description="Choose the type of plan to configure."
      />
      <PageSection>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <Layers3Icon className="text-primary" aria-hidden="true" />
              <CardTitle>Regular Mobile plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Set a package price, billing period, and included Try-On
                credits.
              </p>
              <Link
                href={`${root}/new/regular`}
                className={buttonVariants({ variant: "default" })}
              >
                Continue <ArrowRightIcon aria-hidden="true" />
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CreditCardIcon className="text-primary" aria-hidden="true" />
              <CardTitle>Custom credits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Set one price per credit for 1–1,000 credits. All Mobile plans
                include the same Try-On access.
              </p>
              <Link
                href={`${root}/custom`}
                className={buttonVariants({ variant: "outline" })}
              >
                Continue <ArrowRightIcon aria-hidden="true" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </PageSection>
    </PageContainer>
  );
}
