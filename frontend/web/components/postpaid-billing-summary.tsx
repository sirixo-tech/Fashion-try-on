import { RegionalDateTime } from "@/lib/regional-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@selfx/ui";
import type { StoreSubscriptionSummary } from "@/lib/stores";

export function postpaidMoney(cents: string, currency: string) {
  const amount = BigInt(cents);
  return `${currency} ${(amount / 100n).toLocaleString()}.${(amount % 100n).toString().padStart(2, "0")}`;
}

export function PostpaidBillingSummary({
  summary,
}: {
  summary: NonNullable<StoreSubscriptionSummary["postpaid"]>;
}) {
  const date = (value: string) => <RegionalDateTime value={value} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pay-as-you-go usage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          One successful generation = one credit. No advance purchase or credit
          limit.
        </p>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">
              Billable credits this cycle
            </dt>
            <dd className="text-xl font-semibold">
              {summary.billableCredits.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">
              Estimated generation charges
            </dt>
            <dd className="text-xl font-semibold">
              {postpaidMoney(summary.estimatedAmountCents, summary.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">
              Price per credit for this cycle
            </dt>
            <dd>
              {postpaidMoney(
                String(summary.creditUnitPriceCents),
                summary.currency,
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">
              Existing usage included
            </dt>
            <dd>{summary.historicalCredits.toLocaleString()} credits</dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">
          {date(summary.periodStart)} – {date(summary.periodEnd)} UTC
        </p>
        <p className="text-xs text-muted-foreground">
          This estimate covers generation usage. It is not an invoice; taxes,
          kiosk rent and payment collection are handled separately.
        </p>
      </CardContent>
    </Card>
  );
}
