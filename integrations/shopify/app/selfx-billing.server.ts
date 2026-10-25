import { loadSelfxLinkConfig, SelfxLinkApiError } from "./selfx-link.server";

export type BillingAdmin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};
export const CREATE_SUBSCRIPTION = `mutation SelfxCreateSubscription($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $test: Boolean!) { appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, test: $test, replacementBehavior: APPLY_ON_NEXT_BILLING_CYCLE) { appSubscription { id } confirmationUrl userErrors { field message } } }`;
export const READ_SUBSCRIPTION = `query SelfxReadSubscription($id: ID!) { node(id: $id) { ... on AppSubscription { id status test currentPeriodEnd lineItems { id plan { pricingDetails { __typename ... on AppRecurringPricing { interval price { amount currencyCode } } ... on AppUsagePricing { cappedAmount { amount currencyCode } terms } } } } } } }`;
export const CREATE_USAGE = `mutation SelfxCreateUsage($line: ID!, $price: MoneyInput!, $description: String!, $key: String!) { appUsageRecordCreate(subscriptionLineItemId: $line, price: $price, description: $description, idempotencyKey: $key) { appUsageRecord { id } userErrors { field message } } }`;
export const CANCEL_SUBSCRIPTION = `mutation SelfxCancelSubscription($id: ID!) { appSubscriptionCancel(id: $id) { appSubscription { id status } userErrors { field message } } }`;

async function central<T>(
  path: string,
  shop: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const config = loadSelfxLinkConfig();
  const url = `${config.apiBaseUrl}/api/v1/integrations/shopify/billing${path}${body ? "" : `?${new URLSearchParams({ shop })}`}`;
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Accept: "application/json",
      "x-selfx-shopify-service-token": config.serviceToken,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify({ ...body, shop }) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new SelfxLinkApiError(
      result?.error?.code ?? "SHOPIFY_BILLING_UNAVAILABLE",
      result?.error?.message ??
        "Billing is temporarily unavailable. Your current plan was not changed.",
      response.status,
    );
  }
  return response.json() as Promise<T>;
}
async function graphql<T>(
  admin: BillingAdmin,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, { variables });
  const result = await response.json();
  if (!response.ok || result.errors?.length || !result.data)
    throw new Error("Shopify billing could not be verified. Please retry.");
  return result.data as T;
}
export function billingEnabled() {
  return process.env.SHOPIFY_BILLING_ENABLED === "true";
}
type Prepared = {
  id: string;
  plan: {
    name: string;
    currency: string;
    monthlyPriceCents: number;
    billingMode: string;
    creditUnitPriceCents: number | null;
  };
  usageCapCents: number | null;
  usageTerms: string | null;
};
type Agreement = { id: string; externalSubscriptionId: string; status: string };
export async function scheduledShopifyPlan(
  shop: string,
): Promise<{ name: string; effectiveAfter: string } | null> {
  if (!billingEnabled()) return null;
  const agreements = await central<
    Array<
      Agreement & {
        effectiveAfter: string | null;
        approvedAt: string | null;
        pricingSnapshot: { name: string };
      }
    >
  >("/agreements", shop);
  const pending = agreements.find(
    (item) =>
      item.status === "PENDING" &&
      item.approvedAt &&
      item.effectiveAfter &&
      new Date(item.effectiveAfter) > new Date(),
  );
  return pending
    ? {
        name: pending.pricingSnapshot.name,
        effectiveAfter: pending.effectiveAfter!,
      }
    : null;
}
type NativeSubscription = {
  id: string;
  status: string;
  test: boolean;
  currentPeriodEnd: string | null;
  lineItems: Array<{
    id: string;
    plan: {
      pricingDetails: {
        __typename: string;
        interval?: string;
        price?: { amount: string; currencyCode: string };
        cappedAmount?: { amount: string; currencyCode: string };
        terms?: string;
      };
    };
  }>;
};
const money = (cents: number) => (cents / 100).toFixed(2);
const cents = (value: string) => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error("Unsupported Shopify monetary precision.");
  return Math.round(Number(value) * 100);
};

export async function submitPendingShopifyUsage(
  shop: string,
  admin: BillingAdmin,
) {
  const charges = await central<
    Array<{
      id: string;
      amountCents: number;
      currency: string;
      idempotencyKey: string;
      agreement: { usageLineItemId: string };
    }>
  >("/usage", shop);
  for (const charge of charges) {
    const data = await graphql<{
      appUsageRecordCreate: {
        appUsageRecord: { id: string } | null;
        userErrors: unknown[];
      };
    }>(admin, CREATE_USAGE, {
      line: charge.agreement.usageLineItemId,
      price: {
        amount: money(charge.amountCents),
        currencyCode: charge.currency,
      },
      description: "One successfully generated SelfX Try-On",
      key: charge.idempotencyKey,
    });
    if (
      data.appUsageRecordCreate.userErrors.length ||
      !data.appUsageRecordCreate.appUsageRecord
    )
      throw new Error(
        "Shopify usage reporting needs attention. Pending charges remain safe to retry.",
      );
    await central(`/usage/${charge.id}/acknowledge`, shop, {
      usageRecordId: data.appUsageRecordCreate.appUsageRecord.id,
    });
  }
}
export async function syncShopifyBilling(shop: string, admin: BillingAdmin) {
  if (!billingEnabled()) return;
  const agreements = await central<Agreement[]>("/agreements", shop);
  for (const agreement of agreements) {
    const data = await graphql<{ node: NativeSubscription | null }>(
      admin,
      READ_SUBSCRIPTION,
      { id: agreement.externalSubscriptionId },
    );
    const native = data.node;
    if (!native || native.id !== agreement.externalSubscriptionId)
      throw new Error("Shopify subscription could not be verified.");
    const recurring = native.lineItems.filter(
      (item) => item.plan.pricingDetails.__typename === "AppRecurringPricing",
    );
    const usage = native.lineItems.filter(
      (item) => item.plan.pricingDetails.__typename === "AppUsagePricing",
    );
    if (
      recurring.length > 1 ||
      usage.length > 1 ||
      recurring.some(
        (item) => item.plan.pricingDetails.interval !== "EVERY_30_DAYS",
      )
    )
      throw new Error("Unexpected Shopify billing terms.");
    const rec = recurring[0]?.plan.pricingDetails,
      use = usage[0]?.plan.pricingDetails;
    await central(`/${agreement.id}/confirm`, shop, {
      subscriptionId: native.id,
      status: native.status,
      test: native.test,
      currency:
        rec?.price?.currencyCode ?? use?.cappedAmount?.currencyCode ?? "",
      recurringAmountCents: rec?.price ? cents(rec.price.amount) : 0,
      ...(native.currentPeriodEnd
        ? { periodEnd: native.currentPeriodEnd }
        : {}),
      ...(use?.cappedAmount
        ? {
            usageLineItemId: usage[0]!.id,
            usageCapCents: cents(use.cappedAmount.amount),
            usageTerms: use.terms,
          }
        : {}),
    });
  }
  await submitPendingShopifyUsage(shop, admin);
}
export async function beginShopifyBilling(
  shop: string,
  admin: BillingAdmin,
  planId: string,
  usageCap?: string,
) {
  if (!billingEnabled())
    throw new Error(
      "Shopify billing has not been enabled for this deployment.",
    );
  await submitPendingShopifyUsage(shop, admin);
  const cap = usageCap?.trim();
  if (cap && !/^\d+(?:\.\d{1,2})?$/.test(cap))
    throw new Error("Enter a spending cap with up to two decimal places.");
  const prepared = await central<Prepared>("/prepare", shop, {
    planId,
    ...(cap ? { usageCapCents: cents(cap) } : {}),
  });
  const returnUrl = new URL("/app/billing/return", process.env.SHOPIFY_APP_URL);
  returnUrl.searchParams.set("agreement", prepared.id);
  const lineItems: Record<string, unknown>[] = [];
  if (prepared.plan.monthlyPriceCents > 0)
    lineItems.push({
      plan: {
        appRecurringPricingDetails: {
          price: {
            amount: money(prepared.plan.monthlyPriceCents),
            currencyCode: prepared.plan.currency,
          },
          interval: "EVERY_30_DAYS",
        },
      },
    });
  if (prepared.plan.billingMode === "POSTPAID_PAYG")
    lineItems.push({
      plan: {
        appUsagePricingDetails: {
          cappedAmount: {
            amount: money(prepared.usageCapCents!),
            currencyCode: prepared.plan.currency,
          },
          terms: prepared.usageTerms,
        },
      },
    });
  const result = await graphql<{
    appSubscriptionCreate: {
      confirmationUrl: string | null;
      appSubscription: { id: string } | null;
      userErrors: unknown[];
    };
  }>(admin, CREATE_SUBSCRIPTION, {
    name: prepared.plan.name,
    returnUrl: returnUrl.toString(),
    lineItems,
    test: process.env.SHOPIFY_BILLING_TEST_MODE === "true",
  });
  const created = result.appSubscriptionCreate;
  if (
    created.userErrors.length ||
    !created.appSubscription ||
    !created.confirmationUrl
  )
    throw new Error(
      "Shopify could not create this approval. Check that the plan currency and pricing are supported.",
    );
  const target = new URL(created.confirmationUrl);
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    ![shop, "admin.shopify.com"].includes(target.hostname)
  )
    throw new Error("Shopify returned an unexpected approval destination.");
  try {
    await central(`/${prepared.id}/attach`, shop, {
      subscriptionId: created.appSubscription.id,
    });
  } catch (error) {
    // A concurrent disconnect must not leave a new payable approval behind.
    await graphql(admin, CANCEL_SUBSCRIPTION, {
      id: created.appSubscription.id,
    });
    throw error;
  }
  return target.toString();
}
export async function cancelShopifyBilling(shop: string, admin: BillingAdmin) {
  if (!billingEnabled()) return;
  await submitPendingShopifyUsage(shop, admin);
  const agreements = await central<Agreement[]>("/agreements", shop);
  for (const agreement of agreements) {
    if (!["ACTIVE", "FROZEN", "PENDING"].includes(agreement.status)) continue;
    const data = await graphql<{
      appSubscriptionCancel: { userErrors: unknown[] };
    }>(admin, CANCEL_SUBSCRIPTION, { id: agreement.externalSubscriptionId });
    if (data.appSubscriptionCancel.userErrors.length)
      throw new Error(
        "Shopify could not cancel the plan or pending approval. The connection was retained. Decline pending approvals or retry cancellation in Shopify.",
      );
  }
  await syncShopifyBilling(shop, admin);
}
