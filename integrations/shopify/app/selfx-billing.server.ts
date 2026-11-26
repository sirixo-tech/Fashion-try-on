import { loadSelfxLinkConfig, SelfxLinkApiError } from "./selfx-link.server";

export type BillingAdmin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};
export const CREATE_SUBSCRIPTION = `mutation SelfxCreateSubscription($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $test: Boolean!) { appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, test: $test, replacementBehavior: APPLY_IMMEDIATELY) { appSubscription { id } confirmationUrl userErrors { field message } } }`;
export const CREATE_CREDIT_PURCHASE = `mutation SelfxBuyCredits($name:String!,$price:MoneyInput!,$returnUrl:URL!,$test:Boolean!) { appPurchaseOneTimeCreate(name:$name,price:$price,returnUrl:$returnUrl,test:$test) { appPurchaseOneTime { id } confirmationUrl userErrors { field message } } }`;
export const READ_CREDIT_PURCHASE = `query SelfxReadCreditPurchase($id:ID!) { node(id:$id) { ... on AppPurchaseOneTime { id name status test price { amount currencyCode } } } }`;
export const RECOVER_CREDIT_PURCHASES = `query SelfxRecoverCreditPurchases($after:String) { currentAppInstallation { oneTimePurchases(first:50,after:$after,reverse:true) { nodes { id name status test price { amount currencyCode } } pageInfo { hasNextPage endCursor } } } }`;
export const READ_SUBSCRIPTION = `query SelfxReadSubscription($id: ID!) { node(id: $id) { ... on AppSubscription { id status test currentPeriodEnd lineItems { id plan { pricingDetails { __typename ... on AppRecurringPricing { interval price { amount currencyCode } } ... on AppUsagePricing { cappedAmount { amount currencyCode } terms } } } } } } }`;
export const CREATE_USAGE = `mutation SelfxCreateUsage($line: ID!, $price: MoneyInput!, $description: String!, $key: String!) { appUsageRecordCreate(subscriptionLineItemId: $line, price: $price, description: $description, idempotencyKey: $key) { appUsageRecord { id } userErrors { field message } } }`;
export const CANCEL_SUBSCRIPTION = `mutation SelfxCancelSubscription($id: ID!) { appSubscriptionCancel(id: $id) { appSubscription { id status } userErrors { field message } } }`;
export const RECOVER_SUBSCRIPTIONS = `query SelfxRecoverSubscriptions($after: String) { currentAppInstallation { allSubscriptions(first: 50, after: $after) { nodes { id status returnUrl } pageInfo { hasNextPage endCursor } } } }`;
export const VERIFY_INSTALLATION = `query SelfxVerifyInstallation($after: String) { currentAppInstallation { id activeSubscriptions { id } allSubscriptions(first: 50, after: $after) { nodes { id status } pageInfo { hasNextPage endCursor } } } }`;

async function missingFromInstallation(
  admin: BillingAdmin,
  subscriptionId: string,
) {
  let after: string | null = null;
  for (let page = 0; page < 4; page++) {
    const result: {
      currentAppInstallation: {
        id: string;
        activeSubscriptions: Array<{ id: string }>;
        allSubscriptions: {
          nodes: Array<{ id: string; status: string }>;
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      } | null;
    } = await graphql(admin, VERIFY_INSTALLATION, { after });
    const installation = result.currentAppInstallation;
    if (!installation?.id)
      throw new Error(
        "The current Shopify installation could not be verified.",
      );
    if (
      installation.activeSubscriptions.some(
        (item) => item.id === subscriptionId,
      )
    )
      return false;
    const listed = installation.allSubscriptions.nodes.find(
      (item) => item.id === subscriptionId,
    );
    if (listed)
      return ["CANCELLED", "DECLINED", "EXPIRED"].includes(listed.status);
    if (!installation.allSubscriptions.pageInfo.hasNextPage) return true;
    after = installation.allSubscriptions.pageInfo.endCursor;
  }
  return false;
}

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
    // Only emit a fixed operation label; paths may contain agreement/charge IDs.
    const operation =
      path === "/agreements"
        ? "agreements"
        : path === "/usage"
          ? "usage"
          : path === "/prepare"
            ? "prepare"
            : path.endsWith("/acknowledge")
              ? "acknowledge"
              : path.endsWith("/confirm")
                ? "confirm"
                : path.endsWith("/attach")
                  ? "attach"
                  : "other";
    console.error(
      JSON.stringify({
        event: "selfx_shopify_billing_api_failed",
        operation,
        status: response.status,
      }),
    );
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

function billingReturnUrl(shop: string, agreementId: string): URL {
  const apiKey = process.env.SHOPIFY_API_KEY?.trim();
  if (
    !apiKey ||
    !/^[A-Za-z0-9_-]+$/.test(apiKey) ||
    !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)
  ) {
    throw new Error("Shopify billing return configuration is unavailable.");
  }
  // Return through the admin so Shopify supplies fresh iframe/session context.
  // The application callback still verifies billing using authenticated APIs.
  const handle = shop.slice(0, -".myshopify.com".length);
  const target = new URL(
    `https://admin.shopify.com/store/${handle}/apps/${apiKey}/app/billing/return`,
  );
  target.searchParams.set("agreement", agreementId);
  return target;
}
type Prepared = {
  purchaseKind?: string;
  id: string;
  createAllowed?: boolean;
  confirmationUrl?: string | null;
  status?: string;
  plan: {
    name: string;
    currency: string;
    monthlyPriceCents: number;
    billingMode: string;
    creditUnitPriceCents: number | null;
    includedCredits?: number;
  };
  usageCapCents: number | null;
  usageTerms: string | null;
};
type Agreement = {
  purchaseKind?: string;
  pricingSnapshot?: {
    name: string;
    billingMode: string;
    currency?: string;
    monthlyPriceCents?: number;
    includedCredits?: number;
  };
  id: string;
  externalSubscriptionId: string | null;
  status: string;
  creationStartedAt?: string | null;
  createdAt?: string;
};
export type ShopifyBillingOwnership = "SELFX_MANAGED" | "SHOPIFY_MANAGED";

export async function shopifyBillingOwnership(
  shop: string,
): Promise<ShopifyBillingOwnership> {
  if (!billingEnabled()) return "SELFX_MANAGED";
  const agreements = await central<Agreement[]>("/agreements", shop);
  return agreements.some((agreement) =>
    ["ACTIVE", "FROZEN", "PENDING"].includes(agreement.status),
  )
    ? "SHOPIFY_MANAGED"
    : "SELFX_MANAGED";
}

export async function unapprovedShopifyPlan(
  shop: string,
): Promise<{ name: string } | null> {
  if (!billingEnabled()) return null;
  const agreements = await central<
    Array<
      Agreement & {
        approvedAt: string | null;
        pricingSnapshot: { name: string };
      }
    >
  >("/agreements", shop);
  const pending = agreements.find(
    (item) =>
      item.status === "PENDING" &&
      !item.approvedAt &&
      item.externalSubscriptionId,
  );
  return pending ? { name: pending.pricingSnapshot.name } : null;
}

export async function resumeUnapprovedShopifyPlan(
  shop: string,
): Promise<string> {
  if (!billingEnabled()) throw new Error("Shopify billing is not enabled.");
  const agreements = await central<
    Array<
      Agreement & { approvedAt: string | null; confirmationUrl: string | null }
    >
  >("/agreements", shop);
  const pending = agreements.find(
    (item) =>
      item.status === "PENDING" &&
      !item.approvedAt &&
      item.externalSubscriptionId,
  );
  if (!pending?.confirmationUrl)
    throw new Error(
      "The pending approval could not be reopened. Retry billing verification to refresh its status.",
    );
  const target = new URL(pending.confirmationUrl);
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.port ||
    ![shop, "admin.shopify.com"].includes(target.hostname)
  )
    throw new Error("Shopify returned an unexpected approval destination.");
  return target.toString();
}

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
    if (agreement.purchaseKind === "CREDIT_PACK") {
      await syncCreditPurchase(shop, admin, agreement);
      continue;
    }
    if (!agreement.externalSubscriptionId) {
      // A lost response must never cause a second payable approval. Recover by
      // the server-owned return URL, then retire unapproved orphan requests.
      const started = new Date(
        agreement.creationStartedAt ?? agreement.createdAt ?? "",
      );
      if (
        !Number.isFinite(started.getTime()) ||
        Date.now() - started.getTime() < 120_000
      )
        continue;
      let after: string | null = null;
      let recovered: { id: string; status: string } | undefined;
      let complete = false;
      const legacyReturn = new URL(
        "/app/billing/return",
        process.env.SHOPIFY_APP_URL,
      );
      legacyReturn.searchParams.set("agreement", agreement.id);
      const expectedReturns = new Set([
        legacyReturn.toString(),
        billingReturnUrl(shop, agreement.id).toString(),
      ]);
      for (let page = 0; page < 4; page++) {
        const response: {
          currentAppInstallation: {
            allSubscriptions: {
              nodes: Array<{ id: string; status: string; returnUrl: string }>;
              pageInfo: { hasNextPage: boolean; endCursor: string | null };
            };
          };
        } = await graphql(admin, RECOVER_SUBSCRIPTIONS, { after });
        const list = response.currentAppInstallation.allSubscriptions;
        recovered = list.nodes.find((subscription) =>
          expectedReturns.has(subscription.returnUrl),
        );
        if (recovered || !list.pageInfo.hasNextPage) {
          complete = true;
          break;
        }
        after = list.pageInfo.endCursor;
      }
      if (!complete)
        throw new Error(
          "Shopify is still verifying an interrupted approval. Your current plan is unchanged.",
        );
      if (
        recovered &&
        ["ACTIVE", "ACCEPTED", "FROZEN"].includes(recovered.status)
      ) {
        await central(`/${agreement.id}/attach`, shop, {
          subscriptionId: recovered.id,
        });
        agreement.externalSubscriptionId = recovered.id;
      } else {
        if (recovered?.status === "PENDING") {
          const cancelled = await graphql<{
            appSubscriptionCancel: { userErrors: unknown[] };
          }>(admin, CANCEL_SUBSCRIPTION, { id: recovered.id });
          if (cancelled.appSubscriptionCancel.userErrors.length)
            throw new Error(
              "Shopify could not resolve the interrupted approval. Refresh to check it again.",
            );
        }
        await central(`/${agreement.id}/decline`, shop, {});
        continue;
      }
    }
    const data = await graphql<{ node: NativeSubscription | null }>(
      admin,
      READ_SUBSCRIPTION,
      { id: agreement.externalSubscriptionId },
    );
    const native = data.node;
    if (
      !native &&
      (await missingFromInstallation(admin, agreement.externalSubscriptionId))
    ) {
      await central(`/${agreement.id}/retire-missing`, shop, {
        subscriptionId: agreement.externalSubscriptionId,
      });
      continue;
    }
    if (!native || native.id !== agreement.externalSubscriptionId)
      throw new Error("Shopify subscription could not be verified.");
    if (
      agreement.purchaseKind === "LEGACY_SUBSCRIPTION" &&
      agreement.pricingSnapshot?.billingMode !== "POSTPAID_PAYG" &&
      ["ACTIVE", "FROZEN"].includes(native.status)
    ) {
      if (
        native.status === "ACTIVE" &&
        native.test === (process.env.SHOPIFY_BILLING_TEST_MODE === "true")
      ) {
        const recurringPrice = native.lineItems.find(
          (item) =>
            item.plan.pricingDetails.__typename === "AppRecurringPricing",
        )?.plan.pricingDetails.price;
        if (!recurringPrice)
          throw new Error(
            "The previous monthly charge amount could not be verified.",
          );
        await central(`/${agreement.id}/confirm`, shop, {
          subscriptionId: native.id,
          status: native.status,
          test: native.test,
          currency: recurringPrice.currencyCode,
          recurringAmountCents: cents(recurringPrice.amount),
        });
      }
      const cancelled = await graphql<{
        appSubscriptionCancel: { userErrors: unknown[] };
      }>(admin, CANCEL_SUBSCRIPTION, { id: native.id });
      if (cancelled.appSubscriptionCancel.userErrors.length)
        throw new Error(
          "The previous monthly credit subscription still needs retirement. Your existing credits are retained; retry before buying more.",
        );
      const verified = await graphql<{ node: NativeSubscription | null }>(
        admin,
        READ_SUBSCRIPTION,
        { id: native.id },
      );
      if (!verified.node || verified.node.status !== "CANCELLED")
        throw new Error(
          "Shopify has not confirmed retirement of the previous monthly subscription. Retry verification.",
        );
      native.status = "CANCELLED";
    }
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
  clientRequestId?: string,
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
    ...(clientRequestId ? { clientRequestId } : {}),
    ...(cap ? { usageCapCents: cents(cap) } : {}),
  });
  if (prepared.createAllowed === false) {
    if (prepared.confirmationUrl) {
      const destination = new URL(prepared.confirmationUrl);
      if (
        destination.protocol !== "https:" ||
        destination.username ||
        destination.password ||
        destination.port ||
        ![shop, "admin.shopify.com"].includes(destination.hostname)
      )
        throw new Error("Shopify returned an unexpected approval destination.");
      return destination.toString();
    }
    throw new Error(
      prepared.status === "PENDING"
        ? "This plan change is already being processed or scheduled. Refresh Plans to check it before trying again."
        : "This plan request has already finished. Refresh Plans before choosing another plan.",
    );
  }
  const returnUrl = billingReturnUrl(shop, prepared.id);
  if (prepared.purchaseKind === "CREDIT_PACK") {
    const result = await graphql<{
      appPurchaseOneTimeCreate: {
        appPurchaseOneTime: { id: string } | null;
        confirmationUrl: string | null;
        userErrors: unknown[];
      };
    }>(admin, CREATE_CREDIT_PURCHASE, {
      name: creditPurchaseName(
        prepared.plan.name,
        prepared.id,
        prepared.plan.includedCredits,
      ),
      price: {
        amount: money(prepared.plan.monthlyPriceCents),
        currencyCode: prepared.plan.currency,
      },
      returnUrl: returnUrl.toString(),
      test: process.env.SHOPIFY_BILLING_TEST_MODE === "true",
    });
    const created = result.appPurchaseOneTimeCreate;
    if (created.userErrors.length && !created.appPurchaseOneTime)
      await central(`/${prepared.id}/decline`, shop, {});
    if (
      !created.appPurchaseOneTime ||
      !created.confirmationUrl ||
      created.userErrors.length
    )
      throw new Error(
        "Shopify could not create the credit purchase. No credits were added.",
      );
    const destination = approvalDestination(created.confirmationUrl, shop);
    // A lost attach response is recovered by its unique server-owned purchase name.
    // One-time purchases have no subscription cancellation mutation.
    await central(`/${prepared.id}/attach`, shop, {
      subscriptionId: created.appPurchaseOneTime.id,
      confirmationUrl: destination,
    });
    return destination;
  }
  if (
    prepared.plan.billingMode !== "POSTPAID_PAYG" ||
    prepared.plan.monthlyPriceCents !== 0
  )
    throw new Error(
      "Credit packs require the updated SelfX one-time purchase API. No recurring credit charge was created.",
    );
  const lineItems: Record<string, unknown>[] = [];
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
  if (created.userErrors.length && !created.appSubscription)
    await central(`/${prepared.id}/decline`, shop, {});
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
    target.port ||
    ![shop, "admin.shopify.com"].includes(target.hostname)
  )
    throw new Error("Shopify returned an unexpected approval destination.");
  try {
    await central(`/${prepared.id}/attach`, shop, {
      subscriptionId: created.appSubscription.id,
      confirmationUrl: target.toString(),
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
  if (!billingEnabled())
    throw new Error("This Store's plan is managed in SelfX, not Shopify.");
  const agreements = await central<Agreement[]>("/agreements", shop);
  const cancelableAgreements = agreements.filter(
    (agreement) =>
      agreement.purchaseKind !== "CREDIT_PACK" &&
      agreement.externalSubscriptionId &&
      ["ACTIVE", "FROZEN", "PENDING"].includes(agreement.status),
  );
  if (cancelableAgreements.length === 0)
    throw new Error("There is no active Shopify billing plan to cancel.");
  await submitPendingShopifyUsage(shop, admin);
  for (const agreement of cancelableAgreements) {
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

export async function cancelPendingShopifyChange(
  shop: string,
  admin: BillingAdmin,
) {
  if (!billingEnabled()) throw new Error("Shopify billing is not enabled.");
  const agreements = await central<Agreement[]>("/agreements", shop);
  const pending = agreements.filter(
    (item) => item.status === "PENDING" && item.externalSubscriptionId,
  );
  if (!pending.length)
    throw new Error(
      "There is no pending Shopify change to cancel. Refresh Plans.",
    );
  for (const agreement of pending) {
    const response = await graphql<{
      appSubscriptionCancel: { userErrors: unknown[] };
    }>(admin, CANCEL_SUBSCRIPTION, { id: agreement.externalSubscriptionId });
    if (response.appSubscriptionCancel.userErrors.length)
      throw new Error(
        "Shopify could not cancel the pending change. Refresh to check its status.",
      );
  }
  await syncShopifyBilling(shop, admin);
}

function creditPurchaseName(name: string, id: string, credits?: number) {
  return `${name}${credits ? ` · ${credits} credits` : ""} [SelfX:${id}]`;
}
function approvalDestination(value: string, shop: string) {
  const target = new URL(value);
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.port ||
    ![shop, "admin.shopify.com"].includes(target.hostname)
  )
    throw new Error("Shopify returned an unexpected approval destination.");
  return target.toString();
}
type CreditPurchase = {
  id: string;
  name: string;
  status: string;
  test: boolean;
  price: { amount: string; currencyCode: string };
};
async function syncCreditPurchase(
  shop: string,
  admin: BillingAdmin,
  agreement: Agreement,
) {
  let native: CreditPurchase | null = null;
  if (agreement.externalSubscriptionId) {
    native = (
      await graphql<{ node: CreditPurchase | null }>(
        admin,
        READ_CREDIT_PURCHASE,
        { id: agreement.externalSubscriptionId },
      )
    ).node;
    if (!native)
      throw new Error(
        "The credit purchase could not be verified. No replacement charge was created.",
      );
  } else {
    const started = new Date(
      agreement.creationStartedAt ?? agreement.createdAt ?? "",
    );
    if (
      !Number.isFinite(started.getTime()) ||
      Date.now() - started.getTime() < 120_000
    )
      return;
    let after: string | null = null,
      complete = false;
    const expected = creditPurchaseName(
      agreement.pricingSnapshot?.name ?? "",
      agreement.id,
      agreement.pricingSnapshot?.includedCredits,
    );
    for (let page = 0; page < 4; page++) {
      const data: {
        currentAppInstallation: {
          oneTimePurchases: {
            nodes: CreditPurchase[];
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
          };
        };
      } = await graphql(admin, RECOVER_CREDIT_PURCHASES, { after });
      const list = data.currentAppInstallation.oneTimePurchases;
      native = list.nodes.find((item) => item.name === expected) ?? null;
      if (native || !list.pageInfo.hasNextPage) {
        complete = true;
        break;
      }
      after = list.pageInfo.endCursor;
    }
    if (!complete || !native)
      throw new Error(
        "An interrupted credit purchase needs verification before another purchase. No duplicate charge was created.",
      );
    await central(`/${agreement.id}/attach`, shop, {
      subscriptionId: native.id,
    });
  }
  if (
    native.id !== (agreement.externalSubscriptionId ?? native.id) ||
    native.name !==
      creditPurchaseName(
        agreement.pricingSnapshot?.name ?? "",
        agreement.id,
        agreement.pricingSnapshot?.includedCredits,
      )
  )
    throw new Error("The credit purchase does not match this Store's request.");
  await central(`/${agreement.id}/confirm`, shop, {
    subscriptionId: native.id,
    status: native.status,
    test: native.test,
    currency: native.price.currencyCode,
    recurringAmountCents: cents(native.price.amount),
  });
}
