import { Form } from "react-router";
import type { SelfxStorefrontPricingPlan } from "./selfx-storefront-tryon.server";

export function PlanCard({
  active,
  canChooseShopifyPlan,
  plan,
}: {
  active: boolean;
  canChooseShopifyPlan: boolean;
  plan: SelfxStorefrontPricingPlan;
}) {
  const channelLabel = plan.channels.includes("SHOPIFY")
    ? "Shopify storefront"
    : plan.channels.join(", ");
  const canPurchase =
    canChooseShopifyPlan &&
    (plan.monthlyPriceCents > 0 || plan.billingMode === "POSTPAID_PAYG");
  const featureKeys = Array.isArray(plan.featureKeys) ? plan.featureKeys : [];
  const visibleFeatures = featureKeys.slice(0, 5);
  const hiddenFeatureCount = Math.max(
    featureKeys.length - visibleFeatures.length,
    0,
  );

  return (
    <div className={`selfx-shopify-plan-card${active ? " is-active" : ""}`}>
      <div className="selfx-shopify-plan-card__header">
        <div>
          <div className="selfx-shopify-plan-card__name">{plan.name}</div>
          <div className="selfx-shopify-plan-card__code">{plan.code}</div>
        </div>
      </div>
      <div className="selfx-shopify-plan-card__price">
        {formatMoney(plan.monthlyPriceCents, plan.currency)}
        <span> / month</span>
      </div>
      <div className="selfx-shopify-plan-card__stats">
        <div>
          <span>Credits</span>
          <strong>{plan.includedCredits}</strong>
        </div>
        <div>
          <span>Locations</span>
          <strong>{formatLocationLimit(plan.storeLocationLimit)}</strong>
        </div>
        <div>
          <span>Extra credit</span>
          <strong>
            {formatOptionalMoney(plan.extraCreditPriceCents, plan.currency)}
          </strong>
        </div>
      </div>
      <div className="selfx-shopify-plan-card__meta">{channelLabel}</div>
      {visibleFeatures.length > 0 ? (
        <div className="selfx-shopify-plan-card__features">
          {visibleFeatures.map((featureKey) => (
            <div className="selfx-shopify-plan-card__feature" key={featureKey}>
              <span
                aria-hidden="true"
                className="selfx-shopify-plan-card__feature-icon"
              />
              <span>{planFeatureLabel(featureKey)}</span>
            </div>
          ))}
          {hiddenFeatureCount > 0 ? (
            <details className="selfx-shopify-plan-card__more">
              <summary>+{hiddenFeatureCount} more</summary>
              <div className="selfx-shopify-plan-card__expanded-features">
                {featureKeys.slice(visibleFeatures.length).map((featureKey) => (
                  <div
                    className="selfx-shopify-plan-card__feature"
                    key={featureKey}
                  >
                    <span
                      aria-hidden="true"
                      className="selfx-shopify-plan-card__feature-icon"
                    />
                    <span>{planFeatureLabel(featureKey)}</span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
      {active ? (
        <div className="selfx-shopify-plan-card__active-note">
          {canChooseShopifyPlan
            ? "Current plan. Approved changes take effect at the next renewal."
            : "This plan is assigned to your Store in SelfX."}
        </div>
      ) : (
        <div className="selfx-shopify-plan-card__active-note">
          {canPurchase
            ? "Plan details are set in SelfX; Shopify will show the payment approval."
            : canChooseShopifyPlan
              ? "Free Starter access is assigned automatically by SelfX."
              : "Available plans are assigned by your SelfX administrator."}
        </div>
      )}
      {!active && canPurchase ? (
        <Form method="post" className="selfx-shopify-plan-card__purchase">
          <input type="hidden" name="intent" value="billing:choose" />
          <input type="hidden" name="planId" value={plan.id} />
          {plan.billingMode === "POSTPAID_PAYG" ? (
            <label className="selfx-shopify-plan-card__usage-cap">
              Shopify spending cap (
              {formatMoney(plan.creditUnitPriceCents ?? 0, plan.currency)}{" "}
              minimum)
              <input
                type="number"
                name="usageCap"
                min={((plan.creditUnitPriceCents ?? 1) / 100).toFixed(2)}
                step="0.01"
                required
              />
              <small>
                Maximum Shopify charges for successful Try-Ons in a billing
                period.
              </small>
            </label>
          ) : null}
          <s-button type="submit" variant="primary">
            Buy / Upgrade plan
          </s-button>
        </Form>
      ) : active ? (
        <div className="selfx-shopify-plan-card__purchase">
          <s-button type="button" variant="secondary" disabled>
            In use
          </s-button>
        </div>
      ) : null}
    </div>
  );
}

function planFeatureLabel(featureKey: string): string {
  return featureKey
    .split(/[_:-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD",
    maximumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}

function formatOptionalMoney(
  amountCents: number | null,
  currency: string,
): string {
  return amountCents == null ? "-" : formatMoney(amountCents, currency);
}

function formatLocationLimit(value: number | null): string {
  return value === null ? "Custom" : new Intl.NumberFormat().format(value);
}
