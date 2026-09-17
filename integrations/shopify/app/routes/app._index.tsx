import { useEffect, useState, type ReactNode } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import {
  Form,
  isRouteErrorResponse,
  useActionData,
  useFetcher,
  useLoaderData,
  useLocation,
  useRouteError,
} from "react-router";

import {
  getSelfxIntegrationToken,
  getSelfxConnectionView,
  updateSelfxProductVisibilityRule,
  updateSelfxStorefrontSettings,
  type SelfxConnectionView,
} from "../selfx-connection.server";
import {
  adminFormat,
  adminT,
  normalizeLanguageLocale,
  normalizeStorefrontLocale,
  supportedLanguageLocales,
  supportedStorefrontLocales,
  storefrontLocaleLabel,
  type LanguageLocale,
} from "../selfx-localization";
import {
  SelfxProductControlsClient,
  type SelfxProductControl,
  type SelfxProductControlsResponse,
  type SelfxProductTryOnStatus,
} from "../selfx-product-controls.server";
import {
  SelfxStorefrontTryOnClient,
  type SelfxStorefrontCreditSummary,
  type SelfxStorefrontPricingPlan,
  type SelfxStorefrontUsageSummary,
} from "../selfx-storefront-tryon.server";
import { loadSelfxLinkConfig } from "../selfx-link.server";
import { authenticate } from "../shopify.server";
import { ShopifyAdminClient } from "../../src/shopify-admin.server";
import {
  parseShopifyTryOnMode,
  parseShopifyTryOnVertical,
  tryOnModeAllowsVertical,
  type ShopifyProductVisibilityRule,
  type ShopifyProductVisibilityRules,
  type ShopifyTryOnMode,
  type ShopifyTryOnVertical,
} from "../selfx-tryon-settings";
import { ProductClassificationModal } from "../product-classification-modal";

const tryOnBlockHandle = "selfx_try_it_on";
const lowCreditThreshold = 20;
const limitPeriods = [
  { value: "DAY", textKey: "daily" },
  { value: "WEEK", textKey: "weekly" },
  { value: "MONTH", textKey: "monthly" },
] as const;

type ThemeBlockView = {
  status: "NOT_CHECKED" | "INSTALLED" | "NOT_INSTALLED" | "UNAVAILABLE";
  themeName: string | null;
  checkedFilenames: string[];
  errorMessage: string | null;
};

type CreditHealth = "UNKNOWN" | "HEALTHY" | "LOW" | "EMPTY";

type ProductControlsView = SelfxProductControlsResponse & {
  errorMessage: string | null;
};

type ProductVisibilityMode = "ALL" | "SELECTED" | "OFF";
type ProductVisibilityTab = "COLLECTIONS" | "PRODUCTS";
type ProductVisibilityPicker = ProductVisibilityTab | "EXCEPTIONS";

type ProductCollectionView = {
  id: string;
  title: string;
  handle: string;
  productsCount: number;
  productIds: string[];
};

type ProductCollectionsView = {
  data: ProductCollectionView[];
  errorMessage: string | null;
};

type ProductActionData =
  | {
      productActionError: string | null;
      productActionSuccess: string | null;
      settingsActionError?: string | null;
      settingsActionSuccess?: string | null;
      settingsStorefrontLocale?: string | null;
      settingsAdminLocale?: string | null;
      settingsTryOnMode?: ShopifyTryOnMode | null;
      settingsVisitorTryOnLimit?: number | null;
      settingsVisitorTryOnLimitPeriod?: string | null;
      settingsMonthlyStoreTryOnLimit?: number | null;
    }
  | undefined;

type ShopifyAdminPanelKey =
  "setup" | "display" | "settings" | "analytics" | "plans";

type ShopifyAdminPanel = {
  key: ShopifyAdminPanelKey;
  label: string;
  summary: string;
};

const shopifyAdminPanels: ShopifyAdminPanel[] = [
  {
    key: "setup",
    label: "Setup",
    summary: "Launch checklist and storefront installation.",
  },
  {
    key: "display",
    label: "Display",
    summary: "Product eligibility and storefront behavior.",
  },
  {
    key: "settings",
    label: "Settings",
    summary: "Brand controls and future storefront options.",
  },
  {
    key: "analytics",
    label: "Analytics",
    summary: "Try-On usage, conversion and product insights.",
  },
  {
    key: "plans",
    label: "Plans",
    summary: "Credits, limits and upgrade entry points.",
  },
];

const setupSteps = [
  {
    label: "Open Theme Editor",
    body: "The product template opens directly in Shopify's theme editor.",
  },
  {
    label: 'Add the "SelfX Try It On" block',
    body: "In Product information, choose Add block and select the SelfX app block.",
  },
  {
    label: "Position and customize",
    body: "Place it near buy actions and adjust the block settings to match the storefront.",
  },
  {
    label: "Save and go live",
    body: "After saving, shoppers can launch virtual Try-On from eligible product pages.",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const connection = await safeConnectionView(session.shop);
  return {
    connection,
    themeBlock: await safeThemeBlockView({
      accessToken: session.accessToken,
      connected: connection.status === "CONNECTED",
      shop: session.shop,
    }),
    creditSummary: await safeCreditSummary(session.shop, connection),
    availablePlans: await safeAvailablePlans(session.shop, connection),
    usageSummary: await safeUsageSummary(session.shop, connection),
    productControls: await safeProductControls(session.shop, connection),
    productCollections: await safeProductCollections({
      accessToken: session.accessToken,
      connected: connection.status === "CONNECTED",
      shop: session.shop,
    }),
    selfxBillingUrl: safeSelfxBillingUrl(connection),
    themeEditorUrl: buildTryOnBlockThemeEditorUrl(session.shop),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("SelfX Shopify action could not read form data", error);
    return shopifyActionFailure({
      message: "SelfX could not read that save request. Refresh and try again.",
    });
  }
  const intent = formData.get("intent");
  let session: Awaited<ReturnType<typeof authenticate.admin>>["session"];
  try {
    ({ session } = await authenticate.admin(request));
  } catch (error) {
    console.error("SelfX Shopify action authentication failed", error);
    return shopifyActionFailure({
      intent,
      message:
        "Shopify could not verify this admin session. Refresh the app and try again.",
    });
  }

  if (intent === "setStorefrontSettings") {
    try {
      if (formData.has("tryOnMode")) {
        const client = await productControlsClient(session.shop);
        await client.updateShopifySettings({
          tryOnMode: parseShopifyTryOnMode(formData.get("tryOnMode")),
        });
      }
      const connection = await updateSelfxStorefrontSettings({
        shop: session.shop,
        storefrontLocale: normalizeStorefrontLocale(
          formData.get("storefrontLocale"),
        ),
        adminLocale: normalizeLanguageLocale(formData.get("adminLocale")),
        tryOnMode: formData.has("tryOnMode")
          ? formData.get("tryOnMode")
          : undefined,
        visitorTryOnLimit: formData.get("visitorTryOnLimit"),
        visitorTryOnLimitPeriod: formData.get("visitorTryOnLimitPeriod"),
        monthlyStoreTryOnLimit: formData.get("monthlyStoreTryOnLimit"),
      });
      return {
        productActionError: null,
        productActionSuccess: null,
        settingsActionError: null,
        settingsActionSuccess: "Storefront settings updated.",
        settingsStorefrontLocale: connection.storefrontLocale,
        settingsAdminLocale: connection.adminLocale,
        settingsTryOnMode: connection.tryOnMode,
        settingsVisitorTryOnLimit: connection.visitorTryOnLimit,
        settingsVisitorTryOnLimitPeriod: connection.visitorTryOnLimitPeriod,
        settingsMonthlyStoreTryOnLimit: connection.monthlyStoreTryOnLimit,
      };
    } catch (error) {
      console.error("SelfX Shopify settings update failed", error);
      return {
        productActionError: null,
        productActionSuccess: null,
        settingsActionError: shopifyActionErrorMessage(
          error,
          "SelfX could not update storefront settings.",
        ),
        settingsActionSuccess: null,
        settingsStorefrontLocale: null,
        settingsAdminLocale: null,
        settingsVisitorTryOnLimit: null,
        settingsVisitorTryOnLimitPeriod: null,
        settingsMonthlyStoreTryOnLimit: null,
      };
    }
  }
  if (intent === "setProductVisibilityRule") {
    try {
      const result = await applyProductVisibilityRule({
        accessToken: session.accessToken,
        formData,
        shop: session.shop,
      });
      return {
        productActionError: null,
        productActionSuccess: result.message,
        settingsActionError: null,
        settingsActionSuccess: null,
      };
    } catch (error) {
      console.error(
        "SelfX Shopify product visibility rule update failed",
        error,
      );
      return {
        productActionError: shopifyActionErrorMessage(
          error,
          "SelfX could not update product visibility.",
        ),
        productActionSuccess: null,
        settingsActionError: null,
        settingsActionSuccess: null,
      };
    }
  }

  if (intent === "listProductTypes" || intent === "setProductKind") {
    try {
      const client = await productControlsClient(session.shop);
      if (intent === "listProductTypes") {
        const classificationProducts = await client.listProducts(25, {
          search: String(formData.get("search") ?? ""),
          offset: Number(formData.get("offset") ?? 0),
        });
        return {
          productActionError: null,
          productActionSuccess: null,
          classificationProducts,
        };
      }
      const classificationProduct = await client.setProductKind({
        externalProductId: String(formData.get("externalProductId") ?? ""),
        productVertical: String(formData.get("productVertical") ?? ""),
        jewelleryType: formData.get("jewelleryType")
          ? String(formData.get("jewelleryType"))
          : null,
      });
      return {
        productActionError: null,
        productActionSuccess: "Product type saved.",
        classificationProduct,
      };
    } catch (error) {
      return {
        productActionError: shopifyActionErrorMessage(
          error,
          "SelfX could not update product types.",
        ),
        productActionSuccess: null,
      };
    }
  }

  if (intent !== "setProductVto") {
    return {
      productActionError: "That Shopify product action is not supported.",
      productActionSuccess: null,
      settingsActionError: null,
      settingsActionSuccess: null,
    };
  }

  const externalProductId = String(formData.get("externalProductId") ?? "");
  const enabled = formData.get("enabled") === "true";
  try {
    const client = await productControlsClient(session.shop);
    const product = await client.setProductVto({ externalProductId, enabled });
    return {
      productActionError: null,
      productActionSuccess: `${product.name} Try-On is ${
        product.vtoEnabled ? "enabled" : "disabled"
      }.`,
      settingsActionError: null,
      settingsActionSuccess: null,
    };
  } catch (error) {
    console.error("SelfX Shopify product visibility update failed", error);
    return {
      productActionError: shopifyActionErrorMessage(
        error,
        "SelfX could not update this product.",
      ),
      productActionSuccess: null,
      settingsActionError: null,
      settingsActionSuccess: null,
    };
  }
};

function shopifyActionFailure({
  intent,
  message,
}: {
  intent?: FormDataEntryValue | null;
  message: string;
}): Exclude<ProductActionData, undefined> {
  if (intent === "setStorefrontSettings") {
    return {
      productActionError: null,
      productActionSuccess: null,
      settingsActionError: message,
      settingsActionSuccess: null,
      settingsStorefrontLocale: null,
      settingsAdminLocale: null,
      settingsVisitorTryOnLimit: null,
      settingsVisitorTryOnLimitPeriod: null,
      settingsMonthlyStoreTryOnLimit: null,
    };
  }
  return {
    productActionError: message,
    productActionSuccess: null,
    settingsActionError: null,
    settingsActionSuccess: null,
  };
}

function shopifyActionErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message;
  if (
    message.includes("Unknown argument") ||
    message.includes("does not exist") ||
    message.includes("no such column")
  ) {
    return "SelfX settings storage is not up to date yet. Run the Shopify database migrations and redeploy this app.";
  }
  return message || fallback;
}

export const shouldRevalidate = ({
  defaultShouldRevalidate,
  formData,
}: ShouldRevalidateFunctionArgs) => {
  if (
    formData?.get("intent") === "setStorefrontSettings" ||
    formData?.get("intent") === "listProductTypes"
  ) {
    return false;
  }
  return defaultShouldRevalidate;
};

export default function Index() {
  const loaded = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const location = useLocation();
  const [actionError, setActionError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ShopifyAdminPanelKey>("setup");
  const connection = loaded.connection;
  const themeBlock = loaded.themeBlock;
  const creditSummary = loaded.creditSummary;
  const availablePlans = loaded.availablePlans;
  const usageSummary = loaded.usageSummary;
  const productControls = loaded.productControls;
  const productCollections = loaded.productCollections;
  const selfxBillingUrl = loaded.selfxBillingUrl;
  const themeEditorUrl = loaded.themeEditorUrl;
  const connectActionPath = selfxActionPath(location.search, "connect");
  const completeActionPath = selfxActionPath(location.search, "complete");
  const restartActionPath = selfxActionPath(location.search, "restart");
  const syncActionPath = selfxActionPath(location.search, "sync");

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    setActionError(fragment.get("selfxError"));
  }, []);

  useEffect(() => {
    if (
      connection.status !== "PENDING_APPROVAL" ||
      !connection.pendingLinkExpiresAt
    ) {
      return;
    }
    const interval = window.setInterval(() => {
      window.location.assign(completeActionPath);
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [completeActionPath, connection.pendingLinkExpiresAt, connection.status]);

  const pending = connection.status === "PENDING_APPROVAL";
  const connected = connection.status === "CONNECTED";
  const synced = connection.syncStatus === "SUCCESS";
  const themeBlockInstalled = themeBlock.status === "INSTALLED";
  const storefrontReady = connected && synced && themeBlockInstalled;
  const creditHealth = creditHealthFor(creditSummary);
  const includedCredits =
    creditSummary?.subscription?.pricingPlan?.includedCredits ??
    creditSummary?.subscription?.includedCredits ??
    0;
  const availableCredits = creditSummary?.availableCredits ?? 0;
  const creditAllowance = Math.max(
    includedCredits + (creditSummary?.subscription?.trialCredits ?? 0),
    availableCredits,
  );
  const totalTryOns = usageSummary?.totalTryOns ?? 0;
  const thisMonthTryOns = usageSummary?.thisMonth.tryOns ?? 0;
  const [adminLocale, setAdminLocale] = useState(connection.adminLocale);

  useEffect(() => {
    setAdminLocale(connection.adminLocale);
  }, [connection.adminLocale]);

  const t = (key: Parameters<typeof adminT>[1]) => adminT(adminLocale, key);
  const localizedPlanName =
    creditSummary?.subscription?.pricingPlan?.name ??
    (connected ? t("trial") : t("notConnected"));

  return (
    <s-page heading={t("appHeading")} inlineSize="large">
      <SelfxShopifyStyles />
      <StatusAlerts
        actionError={actionError}
        actionData={actionData}
        connection={connection}
        pending={pending}
      />

      <MerchantAppHeader
        connected={connected}
        connection={connection}
        pending={pending}
        storefrontLocale={connection.storefrontLocale}
        adminLocale={adminLocale}
        completeActionPath={completeActionPath}
        connectActionPath={connectActionPath}
        onAdminLocaleChange={setAdminLocale}
        restartActionPath={restartActionPath}
        syncActionPath={syncActionPath}
      />

      <s-grid
        gridTemplateColumns="repeat(auto-fit, minmax(15rem, 1fr))"
        gap="base"
      >
        <DashboardMetric
          label={t("totalTryOns")}
          value={String(totalTryOns)}
          meta={t("allShopifyStorefrontSessions")}
        />
        <DashboardMetric
          label={t("thisMonth")}
          value={String(thisMonthTryOns)}
          meta={
            usageSummary
              ? adminFormat(adminLocale, "generated", {
                  count: usageSummary.thisMonth.generatedImages,
                })
              : t("noUsageYet")
          }
        />
        <DashboardMetric
          label={t("availableCredits")}
          value={connected ? String(availableCredits) : "-"}
          meta={localizedPlanName}
          badge={
            <CreditBadge adminLocale={adminLocale} health={creditHealth} />
          }
        />
      </s-grid>

      <CreditUsagePanel
        adminLocale={adminLocale}
        availableCredits={availableCredits}
        billingUrl={selfxBillingUrl}
        connected={connected}
        creditHealth={creditHealth}
        totalCredits={creditAllowance}
        planName={localizedPlanName}
      />

      <div className="selfx-shopify-panel-layout">
        <aside className="selfx-shopify-panel-nav">
          <ShopifyPanelNavigation
            activePanel={activePanel}
            adminLocale={adminLocale}
            onChange={setActivePanel}
          />
        </aside>
        <main className="selfx-shopify-panel-main">
          <ShopifyPanelContent
            activePanel={activePanel}
            adminLocale={adminLocale}
            availablePlans={availablePlans}
            availableCredits={availableCredits}
            connected={connected}
            connection={connection}
            creditHealth={creditHealth}
            creditSummary={creditSummary}
            includedCredits={includedCredits}
            pending={pending}
            productCollections={productCollections}
            productControls={productControls}
            onAdminLocaleChange={setAdminLocale}
            selfxBillingUrl={selfxBillingUrl}
            storefrontReady={storefrontReady}
            syncActionPath={syncActionPath}
            synced={synced}
            themeBlock={themeBlock}
            themeBlockInstalled={themeBlockInstalled}
            themeEditorUrl={themeEditorUrl}
            usageSummary={usageSummary}
          />
        </main>
      </div>
    </s-page>
  );
}

function StatusAlerts({
  actionData,
  actionError,
  connection,
  pending,
}: {
  actionData: ProductActionData;
  actionError: string | null;
  connection: SelfxConnectionView;
  pending: boolean;
}) {
  return (
    <>
      {actionError ? (
        <s-banner heading="Connection could not be completed" tone="critical">
          {actionError}
        </s-banner>
      ) : null}
      {connection.errorMessage ? (
        <s-banner
          heading={
            connection.syncStatus === "ERROR"
              ? "Catalog sync needs attention"
              : "SelfX connection needs attention"
          }
          tone={connection.syncStatus === "ERROR" ? "warning" : "critical"}
        >
          {connection.errorMessage}
        </s-banner>
      ) : null}
      {actionData?.productActionError ? (
        <s-banner heading="Product update failed" tone="critical">
          {actionData.productActionError}
        </s-banner>
      ) : null}
      {actionData?.productActionSuccess ? (
        <s-banner heading="Product updated" tone="success">
          {actionData.productActionSuccess}
        </s-banner>
      ) : null}
      {actionData?.settingsActionError ? (
        <s-banner heading="Settings update failed" tone="critical">
          {actionData.settingsActionError}
        </s-banner>
      ) : null}
      {actionData?.settingsActionSuccess ? (
        <s-banner heading="Settings updated" tone="success">
          {actionData.settingsActionSuccess}
        </s-banner>
      ) : null}
      {pending ? (
        <s-banner heading="SelfX approval is open" tone="info">
          Approve this Shopify store in SelfX. This page checks for approval
          automatically; no API key needs to be copied.
        </s-banner>
      ) : null}
    </>
  );
}

function MerchantAppHeader({
  adminLocale,
  completeActionPath,
  connectActionPath,
  connected,
  connection,
  onAdminLocaleChange,
  storefrontLocale,
  pending,
  restartActionPath,
  syncActionPath,
}: {
  adminLocale: string;
  completeActionPath: string;
  connectActionPath: string;
  connected: boolean;
  connection: SelfxConnectionView;
  onAdminLocaleChange: (locale: LanguageLocale) => void;
  storefrontLocale: string;
  pending: boolean;
  restartActionPath: string;
  syncActionPath: string;
}) {
  const fetcher = useFetcher<ProductActionData>();
  const saving = fetcher.state !== "idle";
  const currentAdminLocale = fetcher.data?.settingsAdminLocale ?? adminLocale;
  const t = (key: Parameters<typeof adminT>[1]) =>
    adminT(currentAdminLocale, key);

  function handleAdminLocaleChange(event: {
    currentTarget: { value: string };
  }) {
    const nextLocale = normalizeLanguageLocale(event.currentTarget.value);
    onAdminLocaleChange(nextLocale);

    const formData = new FormData();
    formData.set("intent", "setStorefrontSettings");
    formData.set("storefrontLocale", storefrontLocale);
    formData.set("visitorTryOnLimit", String(connection.visitorTryOnLimit));
    formData.set("visitorTryOnLimitPeriod", connection.visitorTryOnLimitPeriod);
    formData.set(
      "monthlyStoreTryOnLimit",
      String(connection.monthlyStoreTryOnLimit),
    );
    formData.set("adminLocale", nextLocale);
    fetcher.submit(formData, { method: "post" });
  }

  return (
    <s-section>
      <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
        <s-grid-item>
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-box
              padding="base"
              background="subdued"
              borderWidth="small"
              borderColor="base"
              borderRadius="base"
            >
              <s-icon type="product" />
            </s-box>
            <s-stack gap="small-200">
              <s-heading>SelfX Try-On</s-heading>
              <s-text color="subdued">{connection.shop}</s-text>
            </s-stack>
          </s-stack>
        </s-grid-item>
        <s-grid-item>
          <s-stack direction="inline" gap="base" alignItems="end">
            <div className="selfx-shopify-locale-select">
              <s-select
                label={t("adminPanelLanguage")}
                name="adminLocale"
                value={currentAdminLocale}
                onChange={handleAdminLocaleChange}
                disabled={saving}
              >
                {supportedLanguageLocales.map((locale) => (
                  <s-option key={locale.code} value={locale.code}>
                    {locale.label}
                  </s-option>
                ))}
              </s-select>
            </div>
            <a
              className="selfx-shopify-header-refresh"
              href={syncActionPath}
              aria-label={t("refresh")}
              title={t("refresh")}
            >
              <s-icon type="reset" />
            </a>
            <PrimaryActions
              approvalUrl={connection.approvalUrl}
              completeActionPath={completeActionPath}
              connectActionPath={connectActionPath}
              connected={connected}
              pending={pending}
              restartActionPath={restartActionPath}
            />
          </s-stack>
        </s-grid-item>
      </s-grid>
    </s-section>
  );
}

function DashboardMetric({
  badge,
  label,
  meta,
  value,
}: {
  badge?: ReactNode;
  label: string;
  meta: string;
  value: string;
}) {
  return (
    <s-box
      padding="base"
      background="subdued"
      borderWidth="small"
      borderColor="base"
      borderRadius="base"
    >
      <s-stack gap="base">
        <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
          <s-grid-item>
            <s-text color="subdued">{label}</s-text>
          </s-grid-item>
          <s-grid-item>{badge}</s-grid-item>
        </s-grid>
        <s-heading>{value}</s-heading>
        <s-text color="subdued">{meta}</s-text>
      </s-stack>
    </s-box>
  );
}

function CreditUsagePanel({
  adminLocale,
  availableCredits,
  billingUrl,
  connected,
  creditHealth,
  totalCredits,
  planName,
}: {
  adminLocale: string;
  availableCredits: number;
  billingUrl: string | null;
  connected: boolean;
  creditHealth: CreditHealth;
  totalCredits: number;
  planName: string;
}) {
  if (!connected) {
    return null;
  }
  const t = (key: Parameters<typeof adminT>[1]) => adminT(adminLocale, key);
  const empty = creditHealth === "EMPTY";
  const remainingPercent =
    totalCredits > 0
      ? Math.min(100, Math.max(0, (availableCredits / totalCredits) * 100))
      : 0;
  const creditWarningMessage =
    creditHealth === "HEALTHY" || creditHealth === "UNKNOWN"
      ? null
      : empty
        ? t("emptyCreditsMessage")
        : adminFormat(adminLocale, "lowCreditsMessage", {
            threshold: lowCreditThreshold,
          });
  return (
    <s-section>
      <s-box
        padding="base"
        background="base"
        borderWidth="small"
        borderColor="base"
        borderRadius="base"
      >
        <s-stack gap="base">
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
            <s-grid-item>
              <s-stack direction="inline" gap="base" alignItems="center">
                <CreditBadge adminLocale={adminLocale} health={creditHealth} />
                <s-stack gap="small-200">
                  <s-text>
                    {planName} -{" "}
                    {adminFormat(adminLocale, "creditsLeft", {
                      available: availableCredits,
                      included: totalCredits,
                    })}
                  </s-text>
                  {creditWarningMessage ? (
                    <s-text color="subdued">{creditWarningMessage}</s-text>
                  ) : null}
                </s-stack>
              </s-stack>
            </s-grid-item>
            <s-grid-item>
              {billingUrl ? (
                <s-button href={billingUrl} target="_blank" variant="secondary">
                  {t("viewPlans")}
                </s-button>
              ) : null}
            </s-grid-item>
          </s-grid>
          <div
            role="progressbar"
            aria-label={t("availableCredits")}
            aria-valuemin={0}
            aria-valuemax={Math.max(1, totalCredits)}
            aria-valuenow={Math.max(
              0,
              Math.min(availableCredits, totalCredits),
            )}
            aria-valuetext={adminFormat(adminLocale, "creditsLeft", {
              available: availableCredits,
              included: totalCredits,
            })}
            style={{
              background: "#edf2f7",
              borderRadius: "999px",
              height: "0.5rem",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                background: empty
                  ? "#d92d20"
                  : creditHealth === "LOW"
                    ? "#ff6a1a"
                    : "#008a63",
                height: "100%",
                width: `${remainingPercent}%`,
                transition: "width 200ms ease",
              }}
            />
          </div>
        </s-stack>
      </s-box>
    </s-section>
  );
}

function ShopifyPanelNavigation({
  activePanel,
  adminLocale,
  onChange,
}: {
  activePanel: ShopifyAdminPanelKey;
  adminLocale: string;
  onChange: (panel: ShopifyAdminPanelKey) => void;
}) {
  return (
    <s-section>
      <s-stack gap="small-200">
        {shopifyAdminPanels.map((panel) => (
          <SelfxPanelTab
            key={panel.key}
            active={activePanel === panel.key}
            onClick={() => onChange(panel.key)}
          >
            {adminT(adminLocale, panel.key)}
          </SelfxPanelTab>
        ))}
      </s-stack>
    </s-section>
  );
}

function ShopifyPanelContent({
  activePanel,
  adminLocale,
  availablePlans,
  availableCredits,
  connected,
  connection,
  creditHealth,
  creditSummary,
  includedCredits,
  onAdminLocaleChange,
  pending,
  productCollections,
  productControls,
  selfxBillingUrl,
  storefrontReady,
  syncActionPath,
  synced,
  themeBlock,
  themeBlockInstalled,
  themeEditorUrl,
  usageSummary,
}: {
  activePanel: ShopifyAdminPanelKey;
  adminLocale: string;
  availablePlans: SelfxStorefrontPricingPlan[];
  availableCredits: number;
  connected: boolean;
  connection: SelfxConnectionView;
  creditHealth: CreditHealth;
  creditSummary: SelfxStorefrontCreditSummary | null;
  includedCredits: number;
  onAdminLocaleChange: (locale: LanguageLocale) => void;
  pending: boolean;
  productCollections: ProductCollectionsView;
  productControls: ProductControlsView | null;
  selfxBillingUrl: string | null;
  storefrontReady: boolean;
  syncActionPath: string;
  synced: boolean;
  themeBlock: ThemeBlockView;
  themeBlockInstalled: boolean;
  themeEditorUrl: string | null;
  usageSummary: SelfxStorefrontUsageSummary | null;
}) {
  if (activePanel === "display") {
    return (
      <s-stack gap="base">
        {connected ? (
          <ProductControlsSection
            productCollections={productCollections}
            productControls={productControls}
            syncActionPath={syncActionPath}
            tryOnMode={connection.tryOnMode}
            visibilityRules={connection.productVisibilityRules}
          />
        ) : (
          <UnavailablePanel
            heading="Connect SelfX first"
            body="Product Try-On controls become available after this Shopify store is connected."
          />
        )}
      </s-stack>
    );
  }
  if (activePanel === "settings") {
    return (
      <LanguageSettingsPanel
        adminLocale={adminLocale}
        connection={connection}
        onAdminLocaleChange={onAdminLocaleChange}
      />
    );
  }
  if (activePanel === "analytics") {
    return (
      <AnalyticsPanel
        availableCredits={availableCredits}
        connection={connection}
        includedCredits={includedCredits}
        usageSummary={usageSummary}
      />
    );
  }
  if (activePanel === "plans") {
    return (
      <PlansPanel
        adminLocale={adminLocale}
        availablePlans={availablePlans}
        billingUrl={selfxBillingUrl}
        creditHealth={creditHealth}
        creditSummary={creditSummary}
        availableCredits={availableCredits}
        includedCredits={includedCredits}
      />
    );
  }
  return (
    <SetupPanel
      connected={connected}
      connection={connection}
      pending={pending}
      storefrontReady={storefrontReady}
      syncActionPath={syncActionPath}
      synced={synced}
      themeBlock={themeBlock}
      themeBlockInstalled={themeBlockInstalled}
      themeEditorUrl={themeEditorUrl}
    />
  );
}

function SetupPanel({
  connected,
  connection,
  pending,
  storefrontReady,
  syncActionPath,
  synced,
  themeBlock,
  themeBlockInstalled,
  themeEditorUrl,
}: {
  connected: boolean;
  connection: SelfxConnectionView;
  pending: boolean;
  storefrontReady: boolean;
  syncActionPath: string;
  synced: boolean;
  themeBlock: ThemeBlockView;
  themeBlockInstalled: boolean;
  themeEditorUrl: string | null;
}) {
  return (
    <s-stack gap="base">
      <s-section heading="Add Try-On Button to Your Store">
        <s-stack gap="base">
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
            <s-grid-item>
              <s-text color="subdued">
                Add the SelfX button to product pages in a few minutes. No code
                editing is required.
              </s-text>
            </s-grid-item>
            <s-grid-item>
              {storefrontReady ? (
                <s-badge tone="success">Added</s-badge>
              ) : (
                <s-badge tone="warning">Not yet added</s-badge>
              )}
            </s-grid-item>
          </s-grid>
          <SelfxActionButton
            tone="primary"
            href={themeEditorUrl ?? undefined}
            target="_blank"
            disabled={!connected || !themeEditorUrl}
          >
            <s-icon type="external" />
            Open Theme Editor - Product Pages
          </SelfxActionButton>
          <s-stack gap="base">
            {setupSteps.map((step, index) => (
              <SetupInstruction
                key={step.label}
                body={step.body}
                index={index + 1}
                label={step.label}
              />
            ))}
          </s-stack>
          <s-box
            padding="base"
            background="subdued"
            borderWidth="small"
            borderColor="base"
            borderRadius="base"
          >
            <s-text color="subdued">
              Uninstalling the Shopify app automatically removes the app block
              from the theme. Product data remains managed in Shopify.
            </s-text>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="Launch checklist">
        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(14rem, 1fr))"
          gap="base"
        >
          <LaunchStep
            label="Store connected"
            complete={connected}
            pending={pending}
          />
          <LaunchStep
            label="Catalog synced"
            complete={synced}
            pending={connection.syncStatus === "SYNCING"}
          />
          <LaunchStep
            label="Theme block installed"
            complete={themeBlockInstalled}
            pending={
              connected &&
              synced &&
              (themeBlock.status === "NOT_INSTALLED" ||
                themeBlock.status === "UNAVAILABLE")
            }
          />
        </s-grid>
      </s-section>

      <CatalogSyncPanel
        connected={connected}
        connection={connection}
        syncActionPath={syncActionPath}
      />
    </s-stack>
  );
}

function SetupInstruction({
  body,
  index,
  label,
}: {
  body: string;
  index: number;
  label: string;
}) {
  return (
    <s-grid gridTemplateColumns="2.5rem 1fr" gap="base" alignItems="start">
      <s-grid-item>
        <s-box
          padding="small-200"
          background="subdued"
          borderWidth="small"
          borderColor="base"
          borderRadius="base"
        >
          <s-heading>{String(index)}</s-heading>
        </s-box>
      </s-grid-item>
      <s-grid-item>
        <s-stack gap="small-200">
          <s-heading>{label}</s-heading>
          <s-text color="subdued">{body}</s-text>
        </s-stack>
      </s-grid-item>
    </s-grid>
  );
}

function CatalogSyncPanel({
  connected,
  connection,
  syncActionPath,
}: {
  connected: boolean;
  connection: SelfxConnectionView;
  syncActionPath: string;
}) {
  return (
    <s-section heading="Catalog sync">
      <s-stack gap="base">
        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(10rem, 1fr))"
          gap="base"
        >
          <Metric label="Products" value={connection.productsImported} />
          <Metric label="Variants" value={connection.variantsImported} />
          <Metric label="Created" value={connection.created} />
          <Metric label="Updated" value={connection.updated} />
          <Metric label="Archived" value={connection.archived} />
        </s-grid>
        <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
          <s-grid-item>
            <s-stack direction="inline" gap="base" alignItems="center">
              <SyncBadge status={connection.syncStatus} />
              <s-text color="subdued">
                {connection.lastSyncAt
                  ? `Last synced ${formatDate(connection.lastSyncAt)}`
                  : "No completed catalog sync yet"}
              </s-text>
            </s-stack>
          </s-grid-item>
          <s-grid-item>
            <s-button
              href={syncActionPath}
              variant="secondary"
              icon="refresh"
              disabled={!connected}
            >
              Sync catalog
            </s-button>
          </s-grid-item>
        </s-grid>
        <s-text color="subdued">
          Sync is read-only. Shopify remains the source of truth for products,
          prices, inventory, orders and store settings.
        </s-text>
      </s-stack>
    </s-section>
  );
}

function LanguageSettingsPanel({
  adminLocale,
  connection,
  onAdminLocaleChange,
}: {
  adminLocale: string;
  connection: SelfxConnectionView;
  onAdminLocaleChange: (locale: LanguageLocale) => void;
}) {
  const [classifyingProducts, setClassifyingProducts] = useState(false);
  const fetcher = useFetcher<ProductActionData>();
  const saving = fetcher.state !== "idle";
  const currentLocale =
    fetcher.data?.settingsStorefrontLocale ?? connection.storefrontLocale;
  const currentAdminLocale = fetcher.data?.settingsAdminLocale ?? adminLocale;
  const currentVisitorLimit =
    fetcher.data?.settingsVisitorTryOnLimit ?? connection.visitorTryOnLimit;
  const currentVisitorLimitPeriod =
    fetcher.data?.settingsVisitorTryOnLimitPeriod ??
    connection.visitorTryOnLimitPeriod;
  const currentMonthlyLimit =
    fetcher.data?.settingsMonthlyStoreTryOnLimit ??
    connection.monthlyStoreTryOnLimit;
  const currentTryOnMode =
    fetcher.data?.settingsTryOnMode ?? connection.tryOnMode;
  const t = (key: Parameters<typeof adminT>[1]) =>
    adminT(currentAdminLocale, key);

  function handleAdminLocaleChange(event: {
    currentTarget: { value: string };
  }) {
    onAdminLocaleChange(normalizeLanguageLocale(event.currentTarget.value));
  }

  return (
    <s-section heading={t("settings")}>
      <s-stack gap="base">
        <s-stack direction="inline" justifyContent="end">
          <SelfxActionButton
            disabled={connection.status !== "CONNECTED"}
            onClick={() => setClassifyingProducts(true)}
          >
            <s-icon type="edit" /> Product types
          </SelfxActionButton>
        </s-stack>
        {classifyingProducts ? (
          <ProductClassificationModal
            onClose={() => setClassifyingProducts(false)}
          />
        ) : null}
        {fetcher.data?.settingsActionError ? (
          <s-banner heading={t("settingsFailed")} tone="critical">
            {fetcher.data.settingsActionError}
          </s-banner>
        ) : null}
        {fetcher.data?.settingsActionSuccess ? (
          <s-banner heading={t("settingsUpdated")} tone="success">
            {fetcher.data.settingsActionSuccess}
          </s-banner>
        ) : null}
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="setStorefrontSettings" />
          <s-stack gap="base">
            <s-select
              label={t("tryOnTypes")}
              name="tryOnMode"
              value={currentTryOnMode}
              required
            >
              <s-option value="GARMENT">{t("garments")}</s-option>
              <s-option value="JEWELLERY">{t("jewellery")}</s-option>
              <s-option value="BOTH">{t("bothTryOnTypes")}</s-option>
            </s-select>
            <s-divider />
            <s-grid
              gridTemplateColumns="repeat(auto-fit, minmax(14rem, 1fr))"
              gap="base"
            >
              <s-grid-item>
                <s-number-field
                  label={t("maxTryOnsPerVisitor")}
                  name="visitorTryOnLimit"
                  value={String(currentVisitorLimit)}
                  min={0}
                  step={1}
                  inputMode="numeric"
                />
              </s-grid-item>
              <s-grid-item>
                <s-select
                  label={t("visitorLimitPeriod")}
                  name="visitorTryOnLimitPeriod"
                  value={currentVisitorLimitPeriod}
                >
                  {limitPeriods.map((period) => (
                    <s-option key={period.value} value={period.value}>
                      {t(period.textKey)}
                    </s-option>
                  ))}
                </s-select>
              </s-grid-item>
            </s-grid>
            <s-text color="subdued">
              {currentVisitorLimit > 0
                ? adminFormat(currentAdminLocale, "visitorLimitEnabled", {
                    limit: currentVisitorLimit,
                    period: limitPeriodLabel(
                      currentVisitorLimitPeriod,
                      currentAdminLocale,
                    ),
                  })
                : t("visitorLimitsOff")}
            </s-text>
            <s-divider />
            <s-number-field
              label={t("monthlyStoreCap")}
              name="monthlyStoreTryOnLimit"
              value={String(currentMonthlyLimit)}
              min={0}
              step={1}
              inputMode="numeric"
            />
            <s-text color="subdued">
              {currentMonthlyLimit > 0
                ? adminFormat(currentAdminLocale, "monthlyStoreCapEnabled", {
                    limit: currentMonthlyLimit,
                  })
                : t("monthlyStoreCapOff")}
            </s-text>
            <s-divider />
            <s-grid
              gridTemplateColumns="repeat(auto-fit, minmax(14rem, 1fr))"
              gap="base"
            >
              <s-grid-item>
                <s-select
                  label={t("adminPanelLanguage")}
                  name="adminLocale"
                  value={currentAdminLocale}
                  onChange={handleAdminLocaleChange}
                >
                  {supportedLanguageLocales.map((locale) => (
                    <s-option key={locale.code} value={locale.code}>
                      {locale.label}
                    </s-option>
                  ))}
                </s-select>
              </s-grid-item>
              <s-grid-item>
                <s-select
                  label={t("storefrontWidgetLanguage")}
                  name="storefrontLocale"
                  value={currentLocale}
                >
                  {supportedStorefrontLocales.map((locale) => (
                    <s-option key={locale.code} value={locale.code}>
                      {locale.label}
                    </s-option>
                  ))}
                </s-select>
              </s-grid-item>
            </s-grid>
            <s-text color="subdued">
              {currentLocale === "auto"
                ? t("storefrontAutoHelp")
                : adminFormat(currentAdminLocale, "storefrontForcedHelp", {
                    language: storefrontLocaleLabel(currentLocale),
                  })}
            </s-text>
            <s-divider />
            <s-stack direction="inline" justifyContent="end">
              <SelfxActionButton type="submit" tone="primary" disabled={saving}>
                {saving ? t("saving") : t("saveSettings")}
              </SelfxActionButton>
            </s-stack>
          </s-stack>
        </fetcher.Form>
      </s-stack>
    </s-section>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? error.statusText || "Shopify returned an unexpected response."
    : error instanceof Error
      ? error.message
      : "SelfX could not load the Shopify admin app.";

  return (
    <s-page heading="SelfX Virtual Try-On">
      <s-section>
        <s-stack gap="base">
          <s-banner
            heading="SelfX could not complete that request"
            tone="critical"
          >
            {message}
          </s-banner>
          <s-text color="subdued">
            Refresh the Shopify app. If this happened after saving settings,
            make sure the Shopify app database migrations have been applied in
            production.
          </s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}

function limitPeriodLabel(period: string, adminLocale: string): string {
  if (period === "WEEK") return adminT(adminLocale, "weekly").toLowerCase();
  if (period === "MONTH") return adminT(adminLocale, "monthly").toLowerCase();
  return adminT(adminLocale, "daily").toLowerCase();
}

function AnalyticsPanel({
  availableCredits,
  connection,
  includedCredits,
  usageSummary,
}: {
  availableCredits: number;
  connection: SelfxConnectionView;
  includedCredits: number;
  usageSummary: SelfxStorefrontUsageSummary | null;
}) {
  const usedCredits =
    usageSummary?.thisMonth.creditsConsumed ??
    Math.max(0, includedCredits - availableCredits);
  return (
    <s-section heading="Analytics">
      <s-stack gap="base">
        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(12rem, 1fr))"
          gap="base"
        >
          <Metric
            label="Try-Ons this month"
            value={usageSummary?.thisMonth.tryOns ?? 0}
          />
          <Metric
            label="Generated results"
            value={usageSummary?.thisMonth.generatedImages ?? 0}
          />
          <Metric
            label="Completed"
            value={usageSummary?.thisMonth.completedTryOns ?? 0}
          />
          <Metric
            label="Failed"
            value={usageSummary?.thisMonth.failedTryOns ?? 0}
          />
          <Metric label="Credits used" value={usedCredits} />
          <Metric label="Synced products" value={connection.productsImported} />
        </s-grid>
        {usageSummary?.topProducts.length ? (
          <s-box
            padding="base"
            background="subdued"
            borderWidth="small"
            borderColor="base"
            borderRadius="base"
          >
            <s-stack gap="base">
              <s-heading>Most used products this month</s-heading>
              {usageSummary.topProducts.map((product) => (
                <s-grid
                  key={product.productId}
                  gridTemplateColumns="1fr auto"
                  gap="base"
                  alignItems="center"
                >
                  <s-grid-item>
                    <s-stack direction="inline" gap="base" alignItems="center">
                      {product.imageUrl ? (
                        <s-thumbnail
                          src={product.imageUrl}
                          alt={product.productName}
                          size="small"
                        />
                      ) : null}
                      <s-stack gap="small-200">
                        <s-heading>{product.productName}</s-heading>
                        {product.productSlug ? (
                          <s-text color="subdued">{product.productSlug}</s-text>
                        ) : null}
                      </s-stack>
                    </s-stack>
                  </s-grid-item>
                  <s-grid-item>
                    <s-badge tone="info">{product.tryOns} Try-Ons</s-badge>
                  </s-grid-item>
                </s-grid>
              ))}
            </s-stack>
          </s-box>
        ) : (
          <s-text color="subdued">
            Shopify Try-On product rankings will appear after shoppers generate
            storefront Try-Ons.
          </s-text>
        )}
      </s-stack>
    </s-section>
  );
}

function PlansPanel({
  adminLocale,
  availablePlans,
  availableCredits,
  billingUrl,
  creditHealth,
  creditSummary,
  includedCredits,
}: {
  adminLocale: string;
  availablePlans: SelfxStorefrontPricingPlan[];
  availableCredits: number;
  billingUrl: string | null;
  creditHealth: CreditHealth;
  creditSummary: SelfxStorefrontCreditSummary | null;
  includedCredits: number;
}) {
  const currentPlan = creditSummary?.subscription?.pricingPlan ?? null;
  const currentPlanId = currentPlan?.id ?? null;
  const currentPlanCode = currentPlan?.code ?? null;
  const hasCurrentPlanInCatalog = availablePlans.some(
    (plan) =>
      (currentPlanId && plan.id === currentPlanId) ||
      (currentPlanCode && plan.code === currentPlanCode),
  );
  const currentPlanLabel = currentPlan?.name ?? "Trial";

  return (
    <s-section heading="Plans">
      <s-stack gap="base">
        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(12rem, 1fr))"
          gap="base"
        >
          <Metric label="Available credits" value={availableCredits} />
          <Metric label="Plan credits" value={includedCredits} />
        </s-grid>
        <s-box
          padding="base"
          background="subdued"
          borderWidth="small"
          borderColor="base"
          borderRadius="base"
        >
          <s-stack direction="inline" gap="base" alignItems="center">
            <CreditBadge adminLocale={adminLocale} health={creditHealth} />
            <s-stack gap="small-200">
              <s-heading>{currentPlanLabel}</s-heading>
              <s-text color="subdued">
                Manage upgrades and billing in your SelfX dashboard.
              </s-text>
            </s-stack>
          </s-stack>
        </s-box>
        {availablePlans.length > 0 ? (
          <div className="selfx-shopify-plan-grid">
            {!currentPlan ? (
              <PlanCard
                active
                billingUrl={billingUrl}
                plan={{
                  id: "trial",
                  code: "trial",
                  name: "Trial",
                  currency: "USD",
                  monthlyPriceCents: 0,
                  includedCredits,
                  trialCredits: creditSummary?.subscription?.trialCredits ?? 10,
                  storeLocationLimit: null,
                  extraCreditPriceCents: null,
                  kioskMonthlyRentCents: null,
                  kioskDeviceLimit: null,
                  channels: ["SHOPIFY"],
                  featureKeys: [],
                }}
              />
            ) : null}
            {currentPlan && !hasCurrentPlanInCatalog ? (
              <PlanCard
                active
                billingUrl={billingUrl}
                plan={{
                  id: currentPlan.id,
                  code: currentPlan.code,
                  name: currentPlan.name,
                  currency: currentPlan.currency,
                  monthlyPriceCents: currentPlan.monthlyPriceCents,
                  includedCredits: currentPlan.includedCredits,
                  trialCredits: creditSummary?.subscription?.trialCredits ?? 0,
                  storeLocationLimit: currentPlan.storeLocationLimit,
                  extraCreditPriceCents: currentPlan.extraCreditPriceCents,
                  kioskMonthlyRentCents: currentPlan.kioskMonthlyRentCents,
                  kioskDeviceLimit: currentPlan.kioskDeviceLimit,
                  channels: currentPlan.channels,
                  featureKeys: [],
                }}
              />
            ) : null}
            {availablePlans.map((plan) => {
              const active =
                (currentPlanId != null && plan.id === currentPlanId) ||
                (currentPlanCode != null && plan.code === currentPlanCode);
              return (
                <PlanCard
                  key={plan.id}
                  active={active}
                  billingUrl={billingUrl}
                  plan={plan}
                />
              );
            })}
          </div>
        ) : (
          <s-box
            padding="base"
            background="subdued"
            borderWidth="small"
            borderColor="base"
            borderRadius="base"
          >
            <s-stack gap="base">
              <s-text color="subdued">
                SelfX plans are not available in Shopify right now.
              </s-text>
              {billingUrl ? (
                <SelfxActionButton
                  href={billingUrl}
                  target="_blank"
                  tone="primary"
                >
                  View Plans in SelfX
                </SelfxActionButton>
              ) : null}
            </s-stack>
          </s-box>
        )}
      </s-stack>
    </s-section>
  );
}

function PlanCard({
  active,
  billingUrl,
  plan,
}: {
  active: boolean;
  billingUrl: string | null;
  plan: SelfxStorefrontPricingPlan;
}) {
  const channelLabel = plan.channels.includes("SHOPIFY")
    ? "Shopify storefront"
    : plan.channels.join(", ");
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
        {active ? (
          <span className="selfx-shopify-plan-pill selfx-shopify-plan-pill--active">
            Active
          </span>
        ) : null}
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
            <div className="selfx-shopify-plan-card__more">
              +{hiddenFeatureCount} more
            </div>
          ) : null}
        </div>
      ) : null}
      {active ? (
        <div className="selfx-shopify-plan-card__active-note">
          This is your current plan.
        </div>
      ) : (
        <SelfxActionButton
          disabled={!billingUrl}
          href={billingUrl ?? undefined}
          target="_blank"
          tone="primary"
        >
          Upgrade
        </SelfxActionButton>
      )}
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

function UnavailablePanel({
  body,
  heading,
}: {
  body: string;
  heading: string;
}) {
  return (
    <s-section heading={heading}>
      <s-box
        padding="base"
        background="subdued"
        borderWidth="small"
        borderColor="base"
        borderRadius="base"
      >
        <s-text color="subdued">{body}</s-text>
      </s-box>
    </s-section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <s-box
      padding="base"
      background="subdued"
      borderWidth="small"
      borderColor="base"
      borderRadius="base"
    >
      <s-stack gap="small-200">
        <s-text color="subdued">{label}</s-text>
        <s-heading>{String(value)}</s-heading>
      </s-stack>
    </s-box>
  );
}

function SelfxActionButton({
  children,
  disabled = false,
  href,
  onClick,
  target,
  tone = "secondary",
  type = "button",
}: {
  children: ReactNode;
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
  target?: string;
  tone?: "primary" | "secondary";
  type?: "button" | "submit";
}) {
  const className = `selfx-shopify-button selfx-shopify-button--${tone}`;
  if (href && !disabled) {
    return (
      <a
        className={className}
        href={href}
        target={target}
        rel={target === "_blank" ? "noopener noreferrer" : undefined}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      className={className}
      type={type}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SelfxPanelTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`selfx-shopify-tab${active ? " selfx-shopify-tab--active" : ""}`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SelfxShopifyStyles() {
  return (
    <style>
      {`
        .selfx-shopify-button,
        .selfx-shopify-tab {
          align-items: center;
          border-radius: 8px;
          border: 1px solid #c8d7e6;
          cursor: pointer;
          display: inline-flex;
          font: inherit;
          font-weight: 700;
          justify-content: center;
          letter-spacing: 0;
          min-height: 2.5rem;
          text-decoration: none;
          transition:
            background-color 140ms ease,
            border-color 140ms ease,
            box-shadow 140ms ease,
            color 140ms ease,
            transform 140ms ease;
          white-space: nowrap;
        }

        .selfx-shopify-button {
          gap: 0.5rem;
          padding: 0.625rem 1rem;
        }

        .selfx-shopify-button--primary {
          background: #ff6a1a;
          border-color: #ff6a1a;
          box-shadow: 0 8px 18px rgba(255, 106, 26, 0.18);
          color: #ffffff;
        }

        .selfx-shopify-button--secondary {
          background: #ffffff;
          border-color: #c8d7e6;
          color: #12324a;
        }

        .selfx-shopify-button:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        .selfx-shopify-button--primary:hover:not(:disabled) {
          background: #f05f12;
          border-color: #f05f12;
        }

        .selfx-shopify-button--secondary:hover:not(:disabled) {
          background: #f3f8fc;
          border-color: #9fb9cf;
        }

        .selfx-shopify-button:focus-visible,
        .selfx-shopify-tab:focus-visible {
          outline: 2px solid #ff8a3d;
          outline-offset: 2px;
        }

        .selfx-shopify-button:disabled {
          background: #e8f0f7;
          border-color: #d2dde8;
          box-shadow: none;
          color: #7b8da0;
          cursor: not-allowed;
          transform: none;
        }

        .selfx-shopify-tab {
          background: transparent;
          color: #26394d;
          min-height: 2.75rem;
          padding: 0.625rem 0.875rem;
          width: 100%;
        }

        .selfx-shopify-tab:hover {
          background: #f3f8fc;
          border-color: #d6e3ee;
        }

        .selfx-shopify-tab--active {
          background: #fff0e6;
          border-color: #ffd5bd;
          box-shadow: inset 4px 0 0 #ff6a1a;
          color: #9f3d00;
        }

        .selfx-shopify-locale-select {
          inline-size: 12rem;
          max-inline-size: 100%;
        }

        .selfx-shopify-header-refresh {
          align-items: center;
          background: #ffffff;
          border: 1px solid #c8d7e6;
          border-radius: 8px;
          box-sizing: border-box;
          color: #43566b;
          cursor: pointer;
          display: inline-flex;
          flex: 0 0 2rem;
          block-size: 2rem;
          inline-size: 2rem;
          justify-content: center;
          padding: 0;
          text-decoration: none;
        }

        .selfx-shopify-header-refresh:hover {
          background: #f8fbfd;
          border-color: #899caf;
        }

        .selfx-shopify-header-refresh:focus-visible {
          outline: 2px solid #ff6a1a;
          outline-offset: 2px;
        }

        .selfx-shopify-visibility-switch {
          align-items: center;
          background: #f8fbfd;
          border: 1px solid #bfd0e0;
          border-radius: 8px;
          color: #1f2d3d;
          display: grid;
          gap: 1rem;
          grid-template-columns: minmax(0, 1fr) auto;
          padding: 0.875rem 1rem;
          transition:
            background-color 0.16s ease,
            border-color 0.16s ease,
            box-shadow 0.16s ease;
        }

        .selfx-shopify-visibility-switch--on {
          background: #ecfdf4;
          border-color: #00996b;
          box-shadow: inset 4px 0 0 #00996b;
        }

        .selfx-shopify-switch-button {
          align-items: center;
          background: #cfd8e3;
          border: 0;
          border-radius: 999px;
          cursor: pointer;
          display: inline-flex;
          inline-size: 2.75rem;
          justify-content: flex-start;
          min-block-size: 1.5rem;
          padding: 0.1875rem;
          transition: background-color 0.16s ease;
        }

        .selfx-shopify-switch-button--on {
          background: #ff6a1a;
          justify-content: flex-end;
        }

        .selfx-shopify-switch-button span {
          background: #ffffff;
          border-radius: 999px;
          box-shadow: 0 1px 3px rgba(18, 50, 74, 0.25);
          display: block;
          block-size: 1.125rem;
          inline-size: 1.125rem;
        }

        .selfx-shopify-rule-tabs {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .selfx-shopify-rule-tab {
          align-items: center;
          background: #ffffff;
          border: 1px solid #d6e3ee;
          color: #607589;
          cursor: pointer;
          display: inline-flex;
          font: inherit;
          font-weight: 800;
          gap: 0.5rem;
          justify-content: center;
          min-block-size: 2.75rem;
          transition:
            background-color 0.16s ease,
            border-color 0.16s ease,
            color 0.16s ease;
        }

        .selfx-shopify-rule-tab:first-child {
          border-end-start-radius: 8px;
          border-start-start-radius: 8px;
        }

        .selfx-shopify-rule-tab:last-child {
          border-end-end-radius: 8px;
          border-start-end-radius: 8px;
        }

        .selfx-shopify-rule-tab:not(.selfx-shopify-rule-tab--active):hover {
          background: #f3f8fc;
          border-color: #9fb9cf;
        }

        .selfx-shopify-rule-tab--active {
          background: #00996b;
          border-color: #00996b;
          color: #ffffff;
        }

        .selfx-shopify-rule-tab--active:hover {
          background: #007f59;
          border-color: #007f59;
          color: #ffffff;
        }

        .selfx-shopify-rule-tab:focus-visible {
          outline: 2px solid #ff6a1a;
          outline-offset: 2px;
        }

        .selfx-shopify-rule-tab__icon {
          display: inline-flex;
        }

        .selfx-shopify-rule-tab--active .selfx-shopify-rule-tab__icon {
          filter: brightness(0) invert(1);
        }

        .selfx-shopify-selected-list {
          display: grid;
          gap: 0.5rem;
        }

        .selfx-shopify-selected-row {
          align-items: center;
          background: #ffffff;
          border: 1px solid #d6e3ee;
          border-radius: 8px;
          display: grid;
          gap: 0.75rem;
          grid-template-columns: auto minmax(0, 1fr) auto;
          min-block-size: 3.25rem;
          padding: 0.625rem 0.75rem;
        }

        .selfx-shopify-selected-row__meta {
          color: #5f6f82;
          font-size: 0.82rem;
          line-height: 1.35;
        }

        .selfx-shopify-remove-button {
          align-items: center;
          background: transparent;
          border: 0;
          border-radius: 999px;
          color: #6f7f91;
          cursor: pointer;
          display: inline-flex;
          font: inherit;
          font-size: 1.4rem;
          justify-content: center;
          line-height: 1;
          min-block-size: 2rem;
          min-inline-size: 2rem;
        }

        .selfx-shopify-remove-button:hover {
          background: #fff0e6;
          color: #d84f00;
        }

        .selfx-shopify-picker-backdrop {
          align-items: center;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          inset: 0;
          justify-content: center;
          padding: 1rem;
          box-sizing: border-box;
          position: fixed;
          z-index: 40;
        }

        .selfx-shopify-picker-modal {
          background: #ffffff;
          border-radius: 8px;
          box-shadow: 0 20px 60px rgba(0, 17, 44, 0.28);
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          block-size: min(34rem, calc(100dvh - 2rem));
          max-inline-size: 42rem;
          min-block-size: 0;
          overflow: hidden;
          width: 100%;
        }

        .selfx-shopify-picker-header,
        .selfx-shopify-picker-footer {
          align-items: center;
          display: flex;
          gap: 0.5rem;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
        }

        .selfx-shopify-picker-header {
          border-block-end: 1px solid #dce8f2;
        }

        .selfx-shopify-picker-footer {
          border-block-start: 1px solid #dce8f2;
          flex-wrap: wrap;
        }

        .selfx-shopify-picker-footer .selfx-shopify-button {
          min-block-size: 2.25rem;
          padding: 0.375rem 0.75rem;
        }

        .selfx-shopify-picker-body {
          display: grid;
          gap: 0.5rem;
          grid-template-rows: auto minmax(0, 1fr);
          min-block-size: 0;
          overflow: hidden;
          padding: 0.75rem;
        }

        .selfx-shopify-picker-filters {
          display: grid;
          gap: 0.5rem;
          grid-template-columns: minmax(0, 1fr) minmax(7rem, 9rem);
        }

        .selfx-shopify-picker-input,
        .selfx-shopify-picker-select {
          border: 1px solid #b8c9d9;
          border-radius: 8px;
          font: inherit;
          box-sizing: border-box;
          block-size: 2.25rem;
          min-inline-size: 0;
          inline-size: 100%;
          padding: 0.375rem 0.625rem;
        }

        .selfx-shopify-picker-list {
          border: 1px solid #dce8f2;
          border-radius: 8px;
          display: grid;
          align-content: start;
          min-block-size: 0;
          overflow: auto;
          overscroll-behavior: contain;
        }

        .selfx-shopify-picker-row {
          align-items: center;
          border-block-end: 1px solid #edf2f7;
          display: grid;
          gap: 0.75rem;
          grid-template-columns: auto auto minmax(0, 1fr) auto;
          min-block-size: 3rem;
          padding: 0.5rem 0.625rem;
        }

        .selfx-shopify-picker-row > span,
        .selfx-shopify-picker-row > small {
          overflow-wrap: anywhere;
        }

        .selfx-shopify-picker-row:last-child {
          border-block-end: 0;
        }

        .selfx-shopify-picker-row small {
          color: #607589;
          font-size: 0.82rem;
          line-height: 1.35;
        }

        .selfx-shopify-classification-modal {
          border: 0;
          margin: auto;
          padding: 0;
          max-block-size: calc(100dvh - 2rem);
          inline-size: min(42rem, calc(100vw - 2rem));
        }

        .selfx-shopify-classification-modal:not([open]) {
          display: none;
        }

        .selfx-shopify-classification-modal::backdrop {
          background: rgba(0, 0, 0, 0.55);
        }

        .selfx-shopify-classification-search {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 0.5rem;
        }

        .selfx-shopify-classification-row {
          display: grid;
          gap: 0.5rem;
          padding: 0.625rem;
          border-block-end: 1px solid #edf2f7;
        }

        .selfx-shopify-classification-product {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-inline-size: 0;
          overflow-wrap: anywhere;
        }

        .selfx-shopify-classification-product img {
          inline-size: 2.5rem;
          block-size: 2.5rem;
          object-fit: contain;
          flex-shrink: 0;
          border-radius: 4px;
        }

        .selfx-shopify-classification-controls {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
        }

        .selfx-shopify-classification-controls select {
          flex: 1 1 8rem;
          inline-size: auto;
        }

        .selfx-shopify-panel-layout {
          align-items: start;
          display: grid;
          gap: 1rem;
          grid-template-columns: 16rem minmax(0, 1fr);
          min-height: 0;
        }

        .selfx-shopify-panel-nav {
          align-self: start;
          max-height: calc(100vh - 2rem);
          overflow-y: auto;
          position: sticky;
          top: 1rem;
        }

        .selfx-shopify-panel-main {
          max-height: calc(100vh - 2rem);
          min-width: 0;
          overflow-y: auto;
          padding-right: 0.25rem;
        }

        .selfx-shopify-plan-grid {
          display: grid;
          gap: 1rem;
          grid-template-columns: repeat(auto-fill, minmax(15.5rem, 18rem));
          justify-content: start;
        }

        .selfx-shopify-plan-card {
          background: #ffffff;
          border: 1px solid #d6e3ee;
          border-radius: 8px;
          box-shadow: 0 8px 20px rgba(18, 50, 74, 0.06);
          display: flex;
          flex-direction: column;
          gap: 0.875rem;
          inline-size: 100%;
          min-height: 15rem;
          padding: 1rem;
        }

        .selfx-shopify-plan-card.is-active {
          border-color: #ffb987;
          box-shadow:
            inset 0 4px 0 #ff6a1a,
            0 10px 24px rgba(255, 106, 26, 0.12);
        }

        .selfx-shopify-plan-card__header {
          align-items: flex-start;
          display: flex;
          gap: 0.75rem;
          justify-content: space-between;
        }

        .selfx-shopify-plan-card__name {
          color: #00112c;
          font-size: 1rem;
          font-weight: 800;
          line-height: 1.3;
        }

        .selfx-shopify-plan-card__code,
        .selfx-shopify-plan-card__meta,
        .selfx-shopify-plan-card__active-note {
          color: #607589;
          font-size: 0.875rem;
          line-height: 1.4;
        }

        .selfx-shopify-plan-card__price {
          color: #00112c;
          font-size: 1.5rem;
          font-weight: 800;
          line-height: 1.2;
        }

        .selfx-shopify-plan-card__price span {
          color: #607589;
          font-size: 0.875rem;
          font-weight: 600;
        }

        .selfx-shopify-plan-card__stats {
          display: grid;
          gap: 0.375rem;
        }

        .selfx-shopify-plan-card__stats div {
          align-items: baseline;
          display: grid;
          gap: 0.5rem;
          grid-template-columns: minmax(0, 1fr) auto;
          line-height: 1.5;
        }

        .selfx-shopify-plan-card__stats span {
          color: #607589;
          font-size: 0.875rem;
        }

        .selfx-shopify-plan-card__stats strong {
          color: #00112c;
          font-size: 0.875rem;
        }

        .selfx-shopify-plan-card__features {
          display: grid;
          gap: 0.5rem;
          margin-block-start: 0.125rem;
        }

        .selfx-shopify-plan-card__feature {
          align-items: center;
          color: #1f2d3d;
          display: grid;
          font-size: 0.875rem;
          gap: 0.5rem;
          grid-template-columns: auto minmax(0, 1fr);
          line-height: 1.35;
        }

        .selfx-shopify-plan-card__feature-icon {
          align-items: center;
          border: 1px solid #00a66a;
          border-radius: 999px;
          display: inline-flex;
          block-size: 1rem;
          inline-size: 1rem;
          justify-content: center;
          position: relative;
        }

        .selfx-shopify-plan-card__feature-icon::after {
          border-block-end: 2px solid #00a66a;
          border-inline-end: 2px solid #00a66a;
          content: "";
          block-size: 0.45rem;
          inline-size: 0.25rem;
          transform: rotate(45deg) translate(-1px, -1px);
        }

        .selfx-shopify-plan-card__more {
          color: #ff6a1a;
          font-size: 0.875rem;
          font-weight: 700;
        }

        .selfx-shopify-plan-card > .selfx-shopify-button,
        .selfx-shopify-plan-card__active-note {
          margin-block-start: auto;
        }

        .selfx-shopify-plan-pill {
          align-items: center;
          border-radius: 999px;
          display: inline-flex;
          font-size: 0.8125rem;
          font-weight: 800;
          line-height: 1;
          padding: 0.375rem 0.625rem;
          white-space: nowrap;
        }

        .selfx-shopify-plan-pill--active {
          background: #d8f8e4;
          color: #007f4e;
        }

        @media (max-width: 760px) {
          .selfx-shopify-panel-layout {
            grid-template-columns: minmax(0, 1fr);
          }

          .selfx-shopify-panel-nav,
          .selfx-shopify-panel-main {
            max-height: none;
            overflow: visible;
            position: static;
          }
        }
      `}
    </style>
  );
}

function PrimaryActions({
  approvalUrl,
  completeActionPath,
  connectActionPath,
  connected,
  pending,
  restartActionPath,
}: {
  approvalUrl: string | null;
  completeActionPath: string;
  connectActionPath: string;
  connected: boolean;
  pending: boolean;
  restartActionPath: string;
}) {
  if (connected) {
    return null;
  }
  if (pending) {
    return (
      <s-stack direction="inline" gap="base">
        {approvalUrl ? (
          <SelfxActionButton tone="primary" href={approvalUrl} target="_blank">
            Approve in SelfX
          </SelfxActionButton>
        ) : null}
        <s-button href={completeActionPath} variant="secondary">
          Check approval
        </s-button>
        <s-button href={restartActionPath} variant="secondary">
          Restart connection
        </s-button>
      </s-stack>
    );
  }
  return (
    <SelfxActionButton href={connectActionPath} tone="primary">
      Connect SelfX
    </SelfxActionButton>
  );
}

function LaunchStep({
  complete,
  label,
  pending,
}: {
  complete: boolean;
  label: string;
  pending: boolean;
}) {
  return (
    <s-box
      padding="base"
      background={complete ? "base" : "subdued"}
      borderWidth="small"
      borderColor="base"
      borderRadius="base"
    >
      <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
        <s-grid-item>
          <s-heading>{label}</s-heading>
        </s-grid-item>
        <s-grid-item>
          {complete ? (
            <s-badge tone="success">Ready</s-badge>
          ) : pending ? (
            <s-badge tone="warning">Pending</s-badge>
          ) : (
            <s-badge tone="neutral">Waiting</s-badge>
          )}
        </s-grid-item>
      </s-grid>
    </s-box>
  );
}

function SyncBadge({ status }: { status: SelfxConnectionView["syncStatus"] }) {
  if (status === "SUCCESS") return <s-badge tone="success">Synced</s-badge>;
  if (status === "SYNCING") return <s-badge tone="info">Syncing</s-badge>;
  if (status === "ERROR") return <s-badge tone="critical">Sync failed</s-badge>;
  return <s-badge tone="neutral">Not started</s-badge>;
}

function CreditBadge({
  adminLocale,
  health,
}: {
  adminLocale: string;
  health: CreditHealth;
}) {
  const t = (key: Parameters<typeof adminT>[1]) => adminT(adminLocale, key);
  if (health === "EMPTY") {
    return <s-badge tone="critical">{t("noCredits")}</s-badge>;
  }
  if (health === "LOW") {
    return <s-badge tone="warning">{t("lowCredits")}</s-badge>;
  }
  if (health === "HEALTHY") {
    return <s-badge tone="success">{t("creditsAvailable")}</s-badge>;
  }
  return <s-badge tone="neutral">{t("creditsUnavailable")}</s-badge>;
}

function ProductControlsSection({
  productCollections,
  productControls,
  syncActionPath,
  tryOnMode,
  visibilityRules,
}: {
  productCollections: ProductCollectionsView;
  productControls: ProductControlsView | null;
  syncActionPath: string;
  tryOnMode: ShopifyTryOnMode;
  visibilityRules: ShopifyProductVisibilityRules;
}) {
  const products = productControls?.data ?? [];
  const [activeVertical, setActiveVertical] = useState<ShopifyTryOnVertical>(
    tryOnMode === "JEWELLERY" ? "JEWELLERY" : "GARMENT",
  );
  const [rules, setRules] = useState<
    Record<ShopifyTryOnVertical, ShopifyProductVisibilityRule>
  >(() => ({
    GARMENT: initialVisibilityRule(
      products,
      "GARMENT",
      visibilityRules.GARMENT,
    ),
    JEWELLERY: initialVisibilityRule(
      products,
      "JEWELLERY",
      visibilityRules.JEWELLERY,
    ),
  }));
  const [activeTab, setActiveTab] =
    useState<ProductVisibilityTab>("COLLECTIONS");
  const [picker, setPicker] = useState<ProductVisibilityPicker | null>(null);
  const currentRule = rules[activeVertical];
  const selectedCollectionIds = currentRule.selectedCollectionIds;
  const selectedProductIds = currentRule.selectedProductIds;
  const exceptionProductIds = currentRule.exceptionProductIds;
  const visibilityMode = currentRule.mode;
  const allProductsEnabled = visibilityMode === "ALL";
  const verticalProducts = products.filter(
    (product) => product.productVertical === activeVertical,
  );
  const eligibleProducts = verticalProducts.filter(
    isProductEligibleForVisibilityRule,
  );
  const readyCount = eligibleProducts.filter(
    (product) => product.vtoEnabled,
  ).length;
  const selectedCollections = selectedCollectionIds
    .map((id) =>
      productCollections.data.find((collection) => collection.id === id),
    )
    .filter((collection): collection is ProductCollectionView =>
      Boolean(collection),
    );
  const selectedProducts = selectedProductIds
    .map((id) =>
      eligibleProducts.find((product) => product.externalProductId === id),
    )
    .filter((product): product is SelfxProductControl => Boolean(product));
  const exceptionProducts = exceptionProductIds
    .map((id) =>
      verticalProducts.find((product) => product.externalProductId === id),
    )
    .filter((product): product is SelfxProductControl => Boolean(product));

  function updateCurrentRule(
    update: (
      rule: ShopifyProductVisibilityRule,
    ) => ShopifyProductVisibilityRule,
  ) {
    setRules((current) => ({
      ...current,
      [activeVertical]: update(current[activeVertical]),
    }));
  }

  function enableAllProducts() {
    updateCurrentRule((rule) => ({
      ...rule,
      mode: "ALL",
      selectedCollectionIds: [],
      selectedProductIds: [],
    }));
  }

  function disableAllProducts() {
    updateCurrentRule((rule) => ({
      ...rule,
      mode: "OFF",
      selectedCollectionIds: [],
      selectedProductIds: [],
    }));
  }

  function selectCollections(ids: string[]) {
    updateCurrentRule((rule) => ({
      ...rule,
      mode:
        ids.length > 0 || rule.selectedProductIds.length > 0
          ? "SELECTED"
          : "ALL",
      selectedCollectionIds: ids,
    }));
  }

  function selectProducts(ids: string[]) {
    updateCurrentRule((rule) => ({
      ...rule,
      mode:
        rule.selectedCollectionIds.length > 0 || ids.length > 0
          ? "SELECTED"
          : "ALL",
      selectedProductIds: ids,
    }));
  }

  function removeSelectedCollection(id: string) {
    updateCurrentRule((rule) => {
      const selectedCollectionIds = rule.selectedCollectionIds.filter(
        (collectionId) => collectionId !== id,
      );
      return {
        ...rule,
        mode:
          selectedCollectionIds.length === 0 &&
          rule.selectedProductIds.length === 0
            ? "ALL"
            : "SELECTED",
        selectedCollectionIds,
      };
    });
  }

  function removeSelectedProduct(id: string) {
    updateCurrentRule((rule) => {
      const selectedProductIds = rule.selectedProductIds.filter(
        (productId) => productId !== id,
      );
      return {
        ...rule,
        mode:
          rule.selectedCollectionIds.length === 0 &&
          selectedProductIds.length === 0
            ? "ALL"
            : "SELECTED",
        selectedProductIds,
      };
    });
  }

  return (
    <div>
      <s-stack gap="base">
        <s-text color="subdued">
          Choose where the SelfX Try-On button appears. Exceptions always hide
          the button, even when a product matches the selected rule.
        </s-text>

        {tryOnMode === "BOTH" ? (
          <div className="selfx-shopify-rule-tabs" aria-label="Try-On type">
            <VisibilityRuleTab
              active={activeVertical === "GARMENT"}
              icon={<s-icon type="product" />}
              label="Garments"
              onClick={() => {
                setActiveVertical("GARMENT");
                setPicker(null);
              }}
            />
            <VisibilityRuleTab
              active={activeVertical === "JEWELLERY"}
              icon={<s-icon type="product" />}
              label="Jewellery"
              onClick={() => {
                setActiveVertical("JEWELLERY");
                setPicker(null);
              }}
            />
          </div>
        ) : null}

        {productControls?.errorMessage ? (
          <s-banner heading="Product controls unavailable" tone="warning">
            {productControls.errorMessage}
          </s-banner>
        ) : null}

        {productCollections.errorMessage ? (
          <s-banner heading="Collection rules unavailable" tone="warning">
            {productCollections.errorMessage}
          </s-banner>
        ) : null}

        {products.length > 0 ? (
          <Form method="post">
            <input
              type="hidden"
              name="intent"
              value="setProductVisibilityRule"
            />
            <input type="hidden" name="visibilityMode" value={visibilityMode} />
            <input
              type="hidden"
              name="productVertical"
              value={activeVertical}
            />
            {selectedCollectionIds.map((collectionId) => (
              <input
                key={collectionId}
                type="hidden"
                name="selectedCollectionIds"
                value={collectionId}
              />
            ))}
            {selectedProductIds.map((productId) => (
              <input
                key={productId}
                type="hidden"
                name="selectedProductIds"
                value={productId}
              />
            ))}
            {exceptionProductIds.map((productId) => (
              <input
                key={productId}
                type="hidden"
                name="exceptionProductIds"
                value={productId}
              />
            ))}
            <s-stack gap="base">
              <s-section heading="Try-On products">
                <s-stack gap="base">
                  <s-grid
                    gridTemplateColumns="1fr auto"
                    gap="base"
                    alignItems="center"
                  >
                    <s-grid-item>
                      <s-stack gap="small-200">
                        <s-heading>
                          Where should{" "}
                          {activeVertical === "GARMENT"
                            ? "garment"
                            : "jewellery"}{" "}
                          Try-On appear?
                        </s-heading>
                        <s-text color="subdued">
                          Apply visibility in bulk, then use exceptions for
                          products that should stay hidden.
                        </s-text>
                      </s-stack>
                    </s-grid-item>
                    <s-grid-item>
                      <s-badge tone={readyCount > 0 ? "success" : "neutral"}>
                        {readyCount} currently visible
                      </s-badge>
                    </s-grid-item>
                  </s-grid>

                  <div
                    className={`selfx-shopify-visibility-switch${
                      allProductsEnabled
                        ? " selfx-shopify-visibility-switch--on"
                        : ""
                    }`}
                  >
                    <s-stack direction="inline" gap="base" alignItems="center">
                      <s-icon type="view" />
                      <s-stack gap="small-200">
                        <s-heading>All Products</s-heading>
                        <s-text color="subdued">
                          {allProductsEnabled
                            ? "On - Try-On appears on every eligible synced product."
                            : visibilityMode === "SELECTED"
                              ? "Off - button limited to selected items below."
                              : "Off - Try-On is hidden from all products."}
                        </s-text>
                      </s-stack>
                    </s-stack>
                    <button
                      aria-label={
                        allProductsEnabled
                          ? "Turn off all products"
                          : "Turn on all products"
                      }
                      aria-checked={allProductsEnabled}
                      className={`selfx-shopify-switch-button${
                        allProductsEnabled
                          ? " selfx-shopify-switch-button--on"
                          : ""
                      }`}
                      role="switch"
                      type="button"
                      onClick={() =>
                        allProductsEnabled
                          ? disableAllProducts()
                          : enableAllProducts()
                      }
                    >
                      <span aria-hidden="true" />
                    </button>
                  </div>

                  <div className="selfx-shopify-rule-tabs">
                    <VisibilityRuleTab
                      active={activeTab === "COLLECTIONS"}
                      icon={<s-icon type="collection" />}
                      label="By Collection"
                      onClick={() => setActiveTab("COLLECTIONS")}
                    />
                    <VisibilityRuleTab
                      active={activeTab === "PRODUCTS"}
                      icon={<s-icon type="product" />}
                      label="Specific Products"
                      onClick={() => setActiveTab("PRODUCTS")}
                    />
                  </div>

                  {activeTab === "COLLECTIONS" ? (
                    <SelectedCollectionsPanel
                      collections={selectedCollections}
                      onAdd={() => setPicker("COLLECTIONS")}
                      onRemove={removeSelectedCollection}
                    />
                  ) : (
                    <SelectedProductsPanel
                      emptyText="No products selected - use All products or add specific products."
                      onAdd={() => setPicker("PRODUCTS")}
                      onRemove={removeSelectedProduct}
                      products={selectedProducts}
                      title="Select Products"
                    />
                  )}
                </s-stack>
              </s-section>

              <SelectedProductsPanel
                emptyText="No products excluded."
                onAdd={() => setPicker("EXCEPTIONS")}
                onRemove={(id) =>
                  updateCurrentRule((rule) => ({
                    ...rule,
                    exceptionProductIds: rule.exceptionProductIds.filter(
                      (productId) => productId !== id,
                    ),
                  }))
                }
                products={exceptionProducts}
                title="Exceptions - Hide on Specific Products"
              />

              <s-grid
                gridTemplateColumns="1fr auto"
                gap="base"
                alignItems="center"
              >
                <s-grid-item>
                  <s-text color="subdued">
                    Product details stay read-only and continue to sync from
                    Shopify.
                  </s-text>
                </s-grid-item>
                <s-grid-item>
                  <SelfxActionButton type="submit" tone="primary">
                    Apply visibility
                  </SelfxActionButton>
                </s-grid-item>
              </s-grid>

              {picker ? (
                <VisibilityPickerModal
                  collections={productCollections.data}
                  eligibleProducts={
                    picker === "EXCEPTIONS"
                      ? verticalProducts
                      : eligibleProducts
                  }
                  picker={picker}
                  selectedCollectionIds={selectedCollectionIds}
                  selectedProductIds={
                    picker === "EXCEPTIONS"
                      ? exceptionProductIds
                      : selectedProductIds
                  }
                  onClose={() => setPicker(null)}
                  onSave={(ids) => {
                    if (picker === "COLLECTIONS") {
                      selectCollections(ids);
                    } else if (picker === "PRODUCTS") {
                      selectProducts(ids);
                    } else {
                      updateCurrentRule((rule) => ({
                        ...rule,
                        exceptionProductIds: ids,
                      }));
                    }
                    setPicker(null);
                  }}
                />
              ) : null}
            </s-stack>
          </Form>
        ) : null}

        {products.length === 0 ? (
          <s-box
            padding="base"
            background="subdued"
            borderWidth="small"
            borderColor="base"
            borderRadius="base"
          >
            <s-stack gap="base">
              <s-heading>No synced products to manage</s-heading>
              <s-text color="subdued">
                Sync the Shopify catalog to import products, then enable Try-On
                for eligible garments here.
              </s-text>
              <s-button
                href={syncActionPath}
                variant="secondary"
                icon="refresh"
              >
                Sync catalog
              </s-button>
            </s-stack>
          </s-box>
        ) : null}
      </s-stack>
    </div>
  );
}

function initialVisibilityRule(
  products: SelfxProductControl[],
  vertical: ShopifyTryOnVertical,
  persisted: ShopifyProductVisibilityRule | undefined,
): ShopifyProductVisibilityRule {
  if (persisted) return persisted;
  const eligible = products.filter(
    (product) =>
      product.productVertical === vertical &&
      isProductEligibleForVisibilityRule(product),
  );
  const enabledIds = eligible
    .filter((product) => product.vtoEnabled)
    .map((product) => product.externalProductId);
  return {
    mode:
      eligible.length > 0 && enabledIds.length === eligible.length
        ? "ALL"
        : enabledIds.length > 0
          ? "SELECTED"
          : "OFF",
    selectedCollectionIds: [],
    selectedProductIds: enabledIds.length === eligible.length ? [] : enabledIds,
    exceptionProductIds: [],
  };
}

function VisibilityRuleTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`selfx-shopify-rule-tab${
        active ? " selfx-shopify-rule-tab--active" : ""
      }`}
      type="button"
      onClick={onClick}
    >
      <span className="selfx-shopify-rule-tab__icon">{icon}</span>
      {label}
    </button>
  );
}

function SelectedCollectionsPanel({
  collections,
  onAdd,
  onRemove,
}: {
  collections: ProductCollectionView[];
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <s-box
      padding="base"
      background="subdued"
      borderWidth="small"
      borderColor="base"
      borderRadius="base"
    >
      <s-stack gap="base">
        <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
          <s-grid-item>
            <s-stack gap="small-200">
              <s-heading>Select Collections</s-heading>
              <s-text color="subdued">
                Products inside these collections inherit the Try-On button.
              </s-text>
            </s-stack>
          </s-grid-item>
          <s-grid-item>
            <SelfxActionButton onClick={onAdd}>
              <s-icon type="plus" /> Add Collection
            </SelfxActionButton>
          </s-grid-item>
        </s-grid>
        {collections.length > 0 ? (
          <div className="selfx-shopify-selected-list">
            {collections.map((collection) => (
              <SelectedRow
                key={collection.id}
                icon="collection"
                meta={`${collection.productsCount} products`}
                title={collection.title}
                onRemove={() => onRemove(collection.id)}
              />
            ))}
          </div>
        ) : (
          <s-text color="subdued">
            No collections selected - use All products or add collections.
          </s-text>
        )}
      </s-stack>
    </s-box>
  );
}

function SelectedProductsPanel({
  emptyText,
  onAdd,
  onRemove,
  products,
  title,
}: {
  emptyText: string;
  onAdd: () => void;
  onRemove: (id: string) => void;
  products: SelfxProductControl[];
  title: string;
}) {
  const content = (
    <s-stack gap="base">
      <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
        <s-grid-item>
          <s-stack gap="small-200">
            <s-heading>{title}</s-heading>
            <s-text color="subdued">
              {title.startsWith("Exceptions")
                ? "These products never show the Try-On button."
                : "The Try-On button shows only on these exact products."}
            </s-text>
          </s-stack>
        </s-grid-item>
        <s-grid-item>
          <SelfxActionButton onClick={onAdd}>
            <s-icon type="plus" />
            {title.startsWith("Exceptions") ? "Add Exception" : "Add Products"}
          </SelfxActionButton>
        </s-grid-item>
      </s-grid>
      {products.length > 0 ? (
        <div className="selfx-shopify-selected-list">
          {products.map((product) => (
            <SelectedRow
              key={product.externalProductId}
              imageUrl={product.imageUrl}
              meta={
                product.handle
                  ? `Handle: ${product.handle}`
                  : product.externalProductId
              }
              title={product.name}
              onRemove={() => onRemove(product.externalProductId)}
            />
          ))}
        </div>
      ) : (
        <s-text color="subdued">{emptyText}</s-text>
      )}
    </s-stack>
  );
  return title.startsWith("Exceptions") ? (
    <s-section>{content}</s-section>
  ) : (
    <s-box
      padding="base"
      background="subdued"
      borderWidth="small"
      borderColor="base"
      borderRadius="base"
    >
      {content}
    </s-box>
  );
}

function SelectedRow({
  icon,
  imageUrl,
  meta,
  title,
  onRemove,
}: {
  icon?: "collection";
  imageUrl?: string | null;
  meta: string;
  title: string;
  onRemove: () => void;
}) {
  return (
    <div className="selfx-shopify-selected-row">
      {imageUrl ? (
        <s-thumbnail src={imageUrl} alt={title} size="small" />
      ) : (
        <s-icon type={icon ?? "product"} />
      )}
      <div>
        <div>{title}</div>
        <div className="selfx-shopify-selected-row__meta">{meta}</div>
      </div>
      <button
        aria-label={`Remove ${title}`}
        className="selfx-shopify-remove-button"
        type="button"
        onClick={onRemove}
      >
        <s-icon type="x" />
      </button>
    </div>
  );
}

function VisibilityPickerModal({
  collections,
  eligibleProducts,
  onClose,
  onSave,
  picker,
  selectedCollectionIds,
  selectedProductIds,
}: {
  collections: ProductCollectionView[];
  eligibleProducts: SelfxProductControl[];
  onClose: () => void;
  onSave: (ids: string[]) => void;
  picker: ProductVisibilityPicker;
  selectedCollectionIds: string[];
  selectedProductIds: string[];
}) {
  const isCollectionPicker = picker === "COLLECTIONS";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [draftIds, setDraftIds] = useState<string[]>(
    isCollectionPicker ? selectedCollectionIds : selectedProductIds,
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCollections = collections.filter((collection) => {
    if (
      normalizedQuery &&
      !`${collection.title} ${collection.handle}`
        .toLowerCase()
        .includes(normalizedQuery)
    ) {
      return false;
    }
    if (filter === "WITH_SYNCED_PRODUCTS") {
      return collection.productIds.length > 0;
    }
    if (filter === "SELECTED") {
      return draftIds.includes(collection.id);
    }
    return true;
  });
  const filteredProducts = eligibleProducts.filter((product) => {
    if (
      normalizedQuery &&
      !`${product.name} ${product.handle ?? ""} ${product.externalProductId}`
        .toLowerCase()
        .includes(normalizedQuery)
    ) {
      return false;
    }
    if (filter === "READY") {
      return product.tryOnStatus === "READY";
    }
    if (filter === "DISABLED") {
      return product.tryOnStatus === "DISABLED";
    }
    if (filter === "SELECTED") {
      return draftIds.includes(product.externalProductId);
    }
    return true;
  });
  const heading =
    picker === "COLLECTIONS"
      ? "Add collections"
      : picker === "PRODUCTS"
        ? "Add products"
        : "Add exceptions";
  const selectedCount = draftIds.length;

  function toggleDraftId(id: string) {
    setDraftIds((current) =>
      current.includes(id)
        ? current.filter((currentId) => currentId !== id)
        : [...current, id],
    );
  }

  return (
    <div
      aria-label={heading}
      aria-modal="true"
      className="selfx-shopify-picker-backdrop"
      role="dialog"
    >
      <div className="selfx-shopify-picker-modal">
        <div className="selfx-shopify-picker-header">
          <s-heading>{heading}</s-heading>
          <button
            aria-label="Close"
            className="selfx-shopify-header-refresh"
            title="Close"
            type="button"
            onClick={onClose}
          >
            <s-icon type="x" />
          </button>
        </div>
        <div className="selfx-shopify-picker-body">
          <div className="selfx-shopify-picker-filters">
            <input
              aria-label={
                isCollectionPicker ? "Search collections" : "Search products"
              }
              className="selfx-shopify-picker-input"
              placeholder={
                isCollectionPicker ? "Search collections" : "Search products"
              }
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            <select
              aria-label="Filter"
              className="selfx-shopify-picker-select"
              value={filter}
              onChange={(event) => setFilter(event.currentTarget.value)}
            >
              <option value="ALL">All</option>
              <option value="SELECTED">Selected</option>
              {isCollectionPicker ? (
                <option value="WITH_SYNCED_PRODUCTS">
                  With synced products
                </option>
              ) : (
                <>
                  <option value="READY">Ready</option>
                  <option value="DISABLED">Disabled</option>
                </>
              )}
            </select>
          </div>
          <div className="selfx-shopify-picker-list">
            {isCollectionPicker ? (
              filteredCollections.length > 0 ? (
                filteredCollections.map((collection) => (
                  <label
                    key={collection.id}
                    className="selfx-shopify-picker-row"
                  >
                    <input
                      checked={draftIds.includes(collection.id)}
                      type="checkbox"
                      onChange={() => toggleDraftId(collection.id)}
                    />
                    <s-icon type="collection" />
                    <span>
                      {collection.title}
                      <br />
                      <small>
                        {collection.productsCount} products,{" "}
                        {collection.productIds.length} synced matches
                      </small>
                    </span>
                    <small>{collection.handle}</small>
                  </label>
                ))
              ) : (
                <s-box padding="base">
                  <s-text color="subdued">
                    No collections match this search.
                  </s-text>
                </s-box>
              )
            ) : filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
                <label
                  key={product.externalProductId}
                  className="selfx-shopify-picker-row"
                >
                  <input
                    checked={draftIds.includes(product.externalProductId)}
                    type="checkbox"
                    onChange={() => toggleDraftId(product.externalProductId)}
                  />
                  {product.imageUrl ? (
                    <s-thumbnail
                      src={product.imageUrl}
                      alt={product.name}
                      size="small"
                    />
                  ) : (
                    <s-icon type="product" />
                  )}
                  <span>
                    {product.name}
                    <br />
                    <small>
                      {product.handle
                        ? `Handle: ${product.handle}`
                        : product.externalProductId}
                    </small>
                  </span>
                  <ProductStatusBadge status={product.tryOnStatus} />
                </label>
              ))
            ) : (
              <s-box padding="base">
                <s-text color="subdued">No products match this search.</s-text>
              </s-box>
            )}
          </div>
        </div>
        <div className="selfx-shopify-picker-footer">
          <s-text color="subdued">
            {selectedCount} {isCollectionPicker ? "collections" : "products"}{" "}
            selected
          </s-text>
          <s-stack direction="inline" gap="base">
            <SelfxActionButton onClick={onClose}>Cancel</SelfxActionButton>
            <SelfxActionButton tone="primary" onClick={() => onSave(draftIds)}>
              Add
            </SelfxActionButton>
          </s-stack>
        </div>
      </div>
    </div>
  );
}

function isProductEligibleForVisibilityRule(
  product: SelfxProductControl,
): boolean {
  return product.tryOnStatus === "READY" || product.tryOnStatus === "DISABLED";
}

function ProductStatusBadge({ status }: { status: SelfxProductTryOnStatus }) {
  if (status === "READY") return <s-badge tone="success">Ready</s-badge>;
  if (status === "DISABLED") return <s-badge tone="neutral">Disabled</s-badge>;
  if (status === "INACTIVE") return <s-badge tone="warning">Inactive</s-badge>;
  if (status === "MISSING_IMAGE") {
    return <s-badge tone="warning">Missing image</s-badge>;
  }
  if (status === "NEEDS_CLASSIFICATION") {
    return <s-badge tone="warning">Set product type</s-badge>;
  }
  return <s-badge tone="warning">Set jewellery type</s-badge>;
}

async function safeThemeBlockView(input: {
  accessToken: string | undefined;
  connected: boolean;
  shop: string;
}): Promise<ThemeBlockView> {
  if (!input.connected) {
    return emptyThemeBlockView("NOT_CHECKED");
  }
  const shopDomain = normalizeShopDomain(input.shop);
  if (!shopDomain || !input.accessToken) {
    return {
      ...emptyThemeBlockView("UNAVAILABLE"),
      errorMessage: "Theme access is not available for this Shopify session.",
    };
  }

  try {
    const result = await new ShopifyAdminClient({
      shopDomain,
      accessToken: input.accessToken,
      apiVersion: shopifyApiVersion(),
      productPageSize: 50,
    }).getThemeAppBlockStatus(tryOnBlockHandle);
    if (result.status === "NO_MAIN_THEME") {
      return {
        status: "UNAVAILABLE",
        themeName: null,
        checkedFilenames: result.checkedFilenames,
        errorMessage: "No published Shopify theme was found.",
      };
    }
    return {
      status: result.status,
      themeName: result.themeName,
      checkedFilenames: result.checkedFilenames,
      errorMessage: null,
    };
  } catch {
    return {
      ...emptyThemeBlockView("UNAVAILABLE"),
      errorMessage:
        "SelfX could not check the Shopify product template. Confirm the app has read_themes access.",
    };
  }
}

async function safeProductCollections(input: {
  accessToken: string | undefined;
  connected: boolean;
  shop: string;
}): Promise<ProductCollectionsView> {
  if (!input.connected) {
    return { data: [], errorMessage: null };
  }
  const shopDomain = normalizeShopDomain(input.shop);
  if (!shopDomain || !input.accessToken) {
    return {
      data: [],
      errorMessage:
        "Collection access is not available for this Shopify session.",
    };
  }
  try {
    const collections = await new ShopifyAdminClient({
      shopDomain,
      accessToken: input.accessToken,
      apiVersion: shopifyApiVersion(),
      productPageSize: 50,
    }).listProductCollections({ first: 25, productFirst: 250 });
    return {
      data: collections.map((collection) => ({
        id: collection.id,
        title: collection.title,
        handle: collection.handle,
        productsCount: collection.productsCount,
        productIds: collection.products.map((product) => product.id),
      })),
      errorMessage: null,
    };
  } catch {
    return {
      data: [],
      errorMessage:
        "SelfX could not load Shopify collections. Confirm the app has read_products access.",
    };
  }
}

async function applyProductVisibilityRule(input: {
  accessToken: string | undefined;
  formData: FormData;
  shop: string;
}): Promise<{ message: string }> {
  const vertical = parseShopifyTryOnVertical(
    input.formData.get("productVertical"),
  );
  const connection = await getSelfxConnectionView(input.shop);
  if (!tryOnModeAllowsVertical(connection.tryOnMode, vertical)) {
    throw new Error(
      `${vertical === "GARMENT" ? "Garment" : "Jewellery"} Try-On is not enabled in Settings.`,
    );
  }
  const mode = normalizeProductVisibilityMode(
    input.formData.get("visibilityMode"),
  );
  const selectedProductIds = formValueSet(input.formData, "selectedProductIds");
  const selectedCollectionIds = formValueSet(
    input.formData,
    "selectedCollectionIds",
  );
  const exceptionProductIds = formValueSet(
    input.formData,
    "exceptionProductIds",
  );

  const client = await productControlsClient(input.shop);
  const products = (await client.listProducts(50)).data;
  const eligibleProducts = products.filter(
    (product) =>
      product.productVertical === vertical &&
      isProductEligibleForVisibilityRule(product),
  );
  const eligibleIds = new Set(
    eligibleProducts.map((product) => product.externalProductId),
  );
  const verticalIds = new Set(
    products
      .filter((product) => product.productVertical === vertical)
      .map((product) => product.externalProductId),
  );

  let targetIds = new Set<string>();
  if (mode === "ALL") {
    targetIds = new Set(eligibleIds);
  } else if (mode === "SELECTED") {
    if (selectedProductIds.size === 0 && selectedCollectionIds.size === 0) {
      throw new Error("Select at least one collection or product.");
    }
    targetIds = intersectSet(selectedProductIds, eligibleIds);
    if (selectedCollectionIds.size > 0) {
      targetIds = unionSet(
        targetIds,
        intersectSet(
          await resolveCollectionProductIds({
            accessToken: input.accessToken,
            collectionIds: selectedCollectionIds,
            shop: input.shop,
          }),
          eligibleIds,
        ),
      );
    }
  }
  if (mode === "SELECTED" && targetIds.size === 0) {
    throw new Error(
      "That visibility rule did not match any eligible synced SelfX products.",
    );
  }

  let changed = 0;
  for (const product of eligibleProducts) {
    const enabled =
      targetIds.has(product.externalProductId) &&
      !exceptionProductIds.has(product.externalProductId);
    if (product.vtoEnabled === enabled) {
      continue;
    }
    await client.setProductVto({
      externalProductId: product.externalProductId,
      enabled,
    });
    changed += 1;
  }

  const allowedExceptionProductIds = intersectSet(
    exceptionProductIds,
    verticalIds,
  );
  await updateSelfxProductVisibilityRule({
    shop: input.shop,
    vertical,
    rule: {
      mode,
      selectedCollectionIds: [...selectedCollectionIds],
      selectedProductIds: [...intersectSet(selectedProductIds, eligibleIds)],
      exceptionProductIds: [...allowedExceptionProductIds],
    },
  });

  const visible = eligibleProducts.filter(
    (product) =>
      targetIds.has(product.externalProductId) &&
      !exceptionProductIds.has(product.externalProductId),
  ).length;
  return {
    message: `${vertical === "GARMENT" ? "Garment" : "Jewellery"} visibility updated. ${visible} products will show Try-On, ${changed} changed.`,
  };
}

async function resolveCollectionProductIds(input: {
  accessToken: string | undefined;
  collectionIds: Set<string>;
  shop: string;
}): Promise<Set<string>> {
  const shopDomain = normalizeShopDomain(input.shop);
  if (!shopDomain || !input.accessToken) {
    throw new Error("Shopify authentication must be refreshed.");
  }
  const collections = await new ShopifyAdminClient({
    shopDomain,
    accessToken: input.accessToken,
    apiVersion: shopifyApiVersion(),
    productPageSize: 50,
  }).listProductCollections({ first: 50, productFirst: 250 });
  const productIds = new Set<string>();
  for (const collection of collections) {
    if (!input.collectionIds.has(collection.id)) {
      continue;
    }
    for (const product of collection.products) {
      productIds.add(product.id);
    }
  }
  return productIds;
}

function normalizeProductVisibilityMode(
  value: FormDataEntryValue | null,
): ProductVisibilityMode {
  if (value === "SELECTED" || value === "COLLECTIONS" || value === "PRODUCTS") {
    return "SELECTED";
  }
  return value === "OFF" ? "OFF" : "ALL";
}

function formValueSet(formData: FormData, name: string): Set<string> {
  return new Set(
    formData
      .getAll(name)
      .map((value) => String(value).trim())
      .filter(Boolean),
  );
}

function intersectSet(values: Set<string>, allowed: Set<string>): Set<string> {
  return new Set([...values].filter((value) => allowed.has(value)));
}

function unionSet(values: Set<string>, extraValues: Set<string>): Set<string> {
  return new Set([...values, ...extraValues]);
}

function emptyThemeBlockView(status: ThemeBlockView["status"]): ThemeBlockView {
  return {
    status,
    themeName: null,
    checkedFilenames: ["templates/product.json"],
    errorMessage: null,
  };
}

async function safeConnectionView(shop: string): Promise<SelfxConnectionView> {
  try {
    return await getSelfxConnectionView(shop);
  } catch {
    return {
      shop,
      shopName: null,
      status: "ERROR",
      approvalUrl: null,
      pendingLinkExpiresAt: null,
      storeName: null,
      storefrontLocale: "auto",
      adminLocale: "en",
      tryOnMode: "BOTH",
      visitorTryOnLimit: 0,
      visitorTryOnLimitPeriod: "DAY",
      monthlyStoreTryOnLimit: 0,
      linkedAt: null,
      syncStatus: "NOT_STARTED",
      lastSyncAt: null,
      productsImported: 0,
      variantsImported: 0,
      created: 0,
      updated: 0,
      archived: 0,
      errorCode: "SELFX_APP_CONFIGURATION_ERROR",
      errorMessage:
        "SelfX linking is not configured for this Shopify app deployment.",
    };
  }
}

async function safeCreditSummary(
  shop: string,
  connection: SelfxConnectionView,
): Promise<SelfxStorefrontCreditSummary | null> {
  if (connection.status !== "CONNECTED") {
    return null;
  }
  try {
    return await new SelfxStorefrontTryOnClient(
      loadSelfxLinkConfig(),
    ).getCreditSummary(shop);
  } catch {
    return null;
  }
}

async function safeUsageSummary(
  shop: string,
  connection: SelfxConnectionView,
): Promise<SelfxStorefrontUsageSummary | null> {
  if (connection.status !== "CONNECTED") {
    return null;
  }
  try {
    return await new SelfxStorefrontTryOnClient(
      loadSelfxLinkConfig(),
    ).getUsageSummary(shop);
  } catch {
    return null;
  }
}

async function safeAvailablePlans(
  shop: string,
  connection: SelfxConnectionView,
): Promise<SelfxStorefrontPricingPlan[]> {
  if (connection.status !== "CONNECTED") {
    return [];
  }
  try {
    return (
      await new SelfxStorefrontTryOnClient(
        loadSelfxLinkConfig(),
      ).getAvailablePlans(shop)
    ).data;
  } catch {
    return [];
  }
}

async function safeProductControls(
  shop: string,
  connection: SelfxConnectionView,
): Promise<ProductControlsView | null> {
  if (connection.status !== "CONNECTED") {
    return null;
  }
  try {
    return {
      ...(await (await productControlsClient(shop)).listProducts(50)),
      errorMessage: null,
    };
  } catch {
    return {
      data: [],
      hasMore: false,
      summary: {
        total: 0,
        ready: 0,
        disabled: 0,
        needsAttention: 0,
      },
      errorMessage:
        "SelfX could not load synced product controls. Try syncing the catalog again.",
    };
  }
}

async function productControlsClient(
  shop: string,
): Promise<SelfxProductControlsClient> {
  return new SelfxProductControlsClient(
    loadSelfxLinkConfig(),
    await getSelfxIntegrationToken(shop),
  );
}

function safeSelfxBillingUrl(connection: SelfxConnectionView): string | null {
  if (connection.status !== "CONNECTED") {
    return null;
  }
  try {
    return new URL("/app/billing", loadSelfxLinkConfig().webBaseUrl).toString();
  } catch {
    return null;
  }
}

function creditHealthFor(
  creditSummary: SelfxStorefrontCreditSummary | null,
): CreditHealth {
  if (!creditSummary) {
    return "UNKNOWN";
  }
  if (creditSummary.availableCredits <= 0) {
    return "EMPTY";
  }
  if (creditSummary.availableCredits <= lowCreditThreshold) {
    return "LOW";
  }
  return "HEALTHY";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function selfxActionPath(
  signedSearch: string,
  intent: "connect" | "complete" | "restart" | "sync",
): string {
  const signedSuffix = signedSearch ? `&${signedSearch.slice(1)}` : "";
  return `/selfx-action?selfxIntent=${intent}${signedSuffix}`;
}

function buildTryOnBlockThemeEditorUrl(shop: string): string | null {
  // eslint-disable-next-line no-undef
  const apiKey = process.env.SHOPIFY_API_KEY?.trim();
  const shopDomain = normalizeShopDomain(shop);
  if (!apiKey || !shopDomain) return null;

  return `https://${shopDomain}/admin/themes/current/editor?template=product&addAppBlockId=${apiKey}/selfx_try_it_on&target=mainSection`;
}

function shopifyApiVersion(): string {
  const value = process.env.SHOPIFY_API_VERSION?.trim() || "2026-07";
  return /^\d{4}-(01|04|07|10)$/.test(value) ? value : "2026-07";
}

function normalizeShopDomain(shop: string): string | null {
  const clean = shop.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(clean) ? clean : null;
}
