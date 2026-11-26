import { useEffect, useState } from "react";
import { Form, useNavigation } from "react-router";
import type { SelfxStorefrontPricingPlan } from "./selfx-storefront-tryon.server";

export function PlanCard({
  active,
  canChooseShopifyPlan,
  hasActiveShopifyBilling,
  usageActive = false,
  plan,
}: {
  active: boolean;
  canChooseShopifyPlan: boolean;
  hasActiveShopifyBilling: boolean;
  usageActive?: boolean;
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
        {formatMoney(
          plan.billingMode === "POSTPAID_PAYG"
            ? (plan.creditUnitPriceCents ?? 0)
            : plan.monthlyPriceCents,
          plan.currency,
        )}
        <span>
          {plan.billingMode === "POSTPAID_PAYG"
            ? " / successful Try-On · billed monthly"
            : " one-time"}
        </span>
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
          {hasActiveShopifyBilling
            ? "Current access profile. Purchased credits never expire."
            : "Current access profile. You can purchase more credits at any time."}
        </div>
      ) : (
        <div className="selfx-shopify-plan-card__active-note">
          {canPurchase
            ? plan.billingMode === "POSTPAID_PAYG"
              ? "Prepaid credits are used first; additional successful Try-Ons are billed under the approved cap."
              : "One-time payment. Credits never expire. This pack’s configured features and limits apply after purchase."
            : canChooseShopifyPlan
              ? "Starter is a one-time Store trial. Changing plans never renews its allowance."
              : "Plan selection is temporarily unavailable. Refresh to retry."}
        </div>
      )}
      {usageActive ? (
        <div className="selfx-shopify-plan-card__status" role="status">
          Pay as you go enabled
        </div>
      ) : canPurchase && (!active || plan.billingMode !== "POSTPAID_PAYG") ? (
        <PlanPurchaseForm
          plan={plan}
          hasActiveShopifyBilling={hasActiveShopifyBilling}
        />
      ) : active ? (
        <div className="selfx-shopify-plan-card__status" role="status">
          In use
        </div>
      ) : null}
    </div>
  );
}

function PlanPurchaseForm({
  plan,
  hasActiveShopifyBilling,
}: {
  plan: SelfxStorefrontPricingPlan;
  hasActiveShopifyBilling: boolean;
}) {
  const [clientRequestId, setClientRequestId] = useState("");
  const navigation = useNavigation();
  useEffect(() => {
    if (navigation.state === "idle") setClientRequestId(crypto.randomUUID());
  }, [navigation.state]);
  const submitting = navigation.state !== "idle";
  return (
    <Form method="post" className="selfx-shopify-plan-card__purchase">
      <input type="hidden" name="intent" value="billing:choose" />
      <input type="hidden" name="planId" value={plan.id} />
      <input type="hidden" name="clientRequestId" value={clientRequestId} />
      {plan.billingMode === "POSTPAID_PAYG" ? (
        <label className="selfx-shopify-plan-card__usage-cap">
          Shopify spending cap (
          {formatMoney(plan.creditUnitPriceCents ?? 0, plan.currency)} minimum)
          <input
            type="number"
            name="usageCap"
            min={((plan.creditUnitPriceCents ?? 1) / 100).toFixed(2)}
            step="0.01"
            required
          />
          <small>
            Maximum Shopify charges for successful Try-Ons in a billing period.
          </small>
        </label>
      ) : null}
      <button
        className="selfx-shopify-button selfx-shopify-button--primary"
        type="submit"
        disabled={submitting || !clientRequestId}
      >
        {submitting
          ? "Processing…"
          : hasActiveShopifyBilling
            ? plan.billingMode === "POSTPAID_PAYG"
              ? "Update Pay as you go"
              : "Buy credits"
            : plan.billingMode === "POSTPAID_PAYG"
              ? "Enable Pay as you go"
              : "Buy credits"}
      </button>
    </Form>
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
