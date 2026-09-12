import { useEffect, useState, type ReactNode } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useLocation } from "react-router";

import {
  getSelfxIntegrationToken,
  getSelfxConnectionView,
  type SelfxConnectionView,
} from "../selfx-connection.server";
import {
  SelfxProductControlsClient,
  type SelfxProductControl,
  type SelfxProductControlsResponse,
  type SelfxProductTryOnStatus,
} from "../selfx-product-controls.server";
import {
  SelfxStorefrontTryOnClient,
  type SelfxStorefrontCreditSummary,
} from "../selfx-storefront-tryon.server";
import { loadSelfxLinkConfig } from "../selfx-link.server";
import { authenticate } from "../shopify.server";
import { ShopifyAdminClient } from "../../src/shopify-admin.server";

const tryOnBlockHandle = "selfx_try_it_on";
const lowCreditThreshold = 20;

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
    productControls: await safeProductControls(session.shop, connection),
    selfxBillingUrl: safeSelfxBillingUrl(connection),
    themeEditorUrl: buildTryOnBlockThemeEditorUrl(session.shop),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent !== "setProductVto") {
    return {
      productActionError: "That Shopify product action is not supported.",
      productActionSuccess: null,
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
    };
  } catch (error) {
    return {
      productActionError:
        error instanceof Error
          ? error.message
          : "SelfX could not update this product.",
      productActionSuccess: null,
    };
  }
};

export default function Index() {
  const loaded = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const location = useLocation();
  const [actionError, setActionError] = useState<string | null>(null);
  const connection = loaded.connection;
  const themeBlock = loaded.themeBlock;
  const creditSummary = loaded.creditSummary;
  const productControls = loaded.productControls;
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

  return (
    <s-page heading="SelfX Virtual Try-On" inlineSize="large">
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

      <s-section>
        <s-stack gap="base">
          <s-grid
            gridTemplateColumns="repeat(auto-fit, minmax(18rem, 1fr))"
            gap="base"
          >
            <s-grid-item>
              <StatusPanel
                eyebrow="Store connection"
                title={
                  connected
                    ? (connection.storeName ?? "SelfX Store")
                    : pending
                      ? "Approval pending"
                      : "Connect SelfX"
                }
                body={
                  connected
                    ? "SelfX is connected to this Shopify store."
                    : pending
                      ? "Finish approval in SelfX to activate catalog sync."
                      : "Connect an active SelfX Store to unlock Try-On."
                }
                meta={`Shopify shop: ${connection.shop}`}
                badge={<ConnectionBadge status={connection.status} />}
              />
            </s-grid-item>
            <s-grid-item>
              <StatusPanel
                eyebrow="Storefront status"
                title={
                  storefrontReady
                    ? "Ready to launch"
                    : connected && synced
                      ? "Add theme block"
                      : "Setup in progress"
                }
                body={
                  storefrontReady
                    ? "The SelfX Try-On block is installed on the main product template."
                    : connected && synced
                      ? "Catalog sync is complete. Add the storefront block to finish setup."
                    : "Complete connection and sync before enabling shopper Try-On."
                }
                meta={themeBlockMeta(themeBlock)}
                badge={<ThemeBlockBadge status={themeBlock.status} />}
              />
            </s-grid-item>
          </s-grid>

          <PrimaryActions
            approvalUrl={connection.approvalUrl}
            completeActionPath={completeActionPath}
            connectActionPath={connectActionPath}
            connected={connected}
            pending={pending}
            restartActionPath={restartActionPath}
          />
        </s-stack>
      </s-section>

      {pending ? (
        <s-banner heading="Approval is open" tone="info">
          Select an active Store in SelfX. This page checks for approval
          automatically; no API key needs to be copied.
        </s-banner>
      ) : null}

      {connected ? (
        <s-section heading="Credits">
          <CreditStatusBanner
            health={creditHealth}
            billingUrl={selfxBillingUrl}
          />
          <s-grid
            gridTemplateColumns="repeat(auto-fit, minmax(12rem, 1fr))"
            gap="base"
          >
            <Metric
              label="Available credits"
              value={creditSummary?.availableCredits ?? 0}
            />
            <Metric
              label="Plan credits"
              value={
                creditSummary?.subscription?.pricingPlan?.includedCredits ??
                creditSummary?.subscription?.includedCredits ??
                0
              }
            />
          </s-grid>
          <s-box
            padding="base"
            background={creditHealth === "HEALTHY" ? "subdued" : "base"}
            borderWidth="small"
            borderColor="base"
            borderRadius="base"
          >
            <s-stack direction="inline" gap="base" alignItems="center">
              <CreditBadge health={creditHealth} />
              <s-text>
                Current plan:{" "}
                {creditSummary?.subscription?.pricingPlan?.name ?? "Trial"}
              </s-text>
            </s-stack>
          </s-box>
        </s-section>
      ) : null}

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

          <s-box
            padding="base"
            background="subdued"
            borderWidth="small"
            borderColor="base"
            borderRadius="base"
          >
            <s-text color="subdued">
              Sync is read-only. Shopify remains the source of truth for
              products, prices, inventory, orders and store settings.
            </s-text>
          </s-box>
        </s-stack>
      </s-section>

      {connected ? (
        <ProductControlsSection
          productControls={productControls}
          syncActionPath={syncActionPath}
        />
      ) : null}

      <s-section heading="Storefront">
        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(18rem, 1fr))"
          gap="base"
        >
          <s-grid-item>
            <s-stack gap="base">
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
            </s-stack>
          </s-grid-item>
          <s-grid-item>
            <s-box
              padding="base"
              background="subdued"
              borderWidth="small"
              borderColor="base"
              borderRadius="base"
            >
              <s-stack gap="base">
                <s-stack gap="small-200">
                  <s-heading>Add Try-On block</s-heading>
                  <s-text color="subdued">
                    {themeBlockInstalled
                      ? "The SelfX Try It On block is installed on the main product template."
                      : "Open the Shopify theme editor and place the SelfX Try It On block on your product template."}
                  </s-text>
                </s-stack>
                <s-button
                  variant="primary"
                  href={themeEditorUrl ?? undefined}
                  target="_blank"
                  disabled={!connected || !themeEditorUrl}
                >
                  {themeBlockInstalled ? "Open theme editor" : "Add Try-On block"}
                </s-button>
              </s-stack>
            </s-box>
          </s-grid-item>
        </s-grid>
      </s-section>
    </s-page>
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

function StatusPanel({
  badge,
  body,
  eyebrow,
  meta,
  title,
}: {
  badge: ReactNode;
  body: string;
  eyebrow: string;
  meta: string;
  title: string;
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
        <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="start">
          <s-grid-item>
            <s-stack gap="small-200">
              <s-text color="subdued">{eyebrow}</s-text>
              <s-heading>{title}</s-heading>
            </s-stack>
          </s-grid-item>
          <s-grid-item>{badge}</s-grid-item>
        </s-grid>
        <s-text>{body}</s-text>
        <s-text color="subdued">{meta}</s-text>
      </s-stack>
    </s-box>
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
          <s-button variant="primary" href={approvalUrl} target="_blank">
            Approve in SelfX
          </s-button>
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
    <s-button href={connectActionPath} variant="primary">
      Connect SelfX
    </s-button>
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

function ConnectionBadge({
  status,
}: {
  status: SelfxConnectionView["status"];
}) {
  if (status === "CONNECTED")
    return <s-badge tone="success">Connected</s-badge>;
  if (status === "PENDING_APPROVAL") {
    return <s-badge tone="warning">Approval pending</s-badge>;
  }
  if (status === "ERROR") return <s-badge tone="critical">Error</s-badge>;
  return <s-badge tone="neutral">Not connected</s-badge>;
}

function SyncBadge({ status }: { status: SelfxConnectionView["syncStatus"] }) {
  if (status === "SUCCESS") return <s-badge tone="success">Synced</s-badge>;
  if (status === "SYNCING") return <s-badge tone="info">Syncing</s-badge>;
  if (status === "ERROR") return <s-badge tone="critical">Sync failed</s-badge>;
  return <s-badge tone="neutral">Not started</s-badge>;
}

function ThemeBlockBadge({ status }: { status: ThemeBlockView["status"] }) {
  if (status === "INSTALLED") return <s-badge tone="success">Installed</s-badge>;
  if (status === "NOT_INSTALLED") {
    return <s-badge tone="warning">Not installed</s-badge>;
  }
  if (status === "UNAVAILABLE") {
    return <s-badge tone="warning">Check unavailable</s-badge>;
  }
  return <s-badge tone="neutral">Not checked</s-badge>;
}

function CreditStatusBanner({
  billingUrl,
  health,
}: {
  billingUrl: string | null;
  health: CreditHealth;
}) {
  if (health === "HEALTHY" || health === "UNKNOWN") {
    return null;
  }
  const empty = health === "EMPTY";
  return (
    <s-banner
      heading={empty ? "Try-On is paused" : "Try-On credits are low"}
      tone={empty ? "critical" : "warning"}
    >
      <s-stack gap="base">
        <s-text>
          {empty
            ? "This store has no Try-On credits left. Shoppers will see a temporary unavailable message until credits are added."
            : `This store has ${lowCreditThreshold} or fewer Try-On credits remaining.`}
        </s-text>
        {billingUrl ? (
          <s-button href={billingUrl} target="_blank" variant="secondary">
            Open SelfX Billing
          </s-button>
        ) : null}
      </s-stack>
    </s-banner>
  );
}

function CreditBadge({ health }: { health: CreditHealth }) {
  if (health === "EMPTY") {
    return <s-badge tone="critical">No credits</s-badge>;
  }
  if (health === "LOW") {
    return <s-badge tone="warning">Low credits</s-badge>;
  }
  if (health === "HEALTHY") {
    return <s-badge tone="success">Credits available</s-badge>;
  }
  return <s-badge tone="neutral">Credits unavailable</s-badge>;
}

function ProductControlsSection({
  productControls,
  syncActionPath,
}: {
  productControls: ProductControlsView | null;
  syncActionPath: string;
}) {
  const products = productControls?.data ?? [];
  return (
    <s-section heading="Try-On products">
      <s-stack gap="base">
        <s-text color="subdued">
          Manage SelfX Try-On eligibility for products synchronized from this
          Shopify store. Product details stay read-only and continue to sync
          from Shopify.
        </s-text>

        {productControls?.errorMessage ? (
          <s-banner heading="Product controls unavailable" tone="warning">
            {productControls.errorMessage}
          </s-banner>
        ) : null}

        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(10rem, 1fr))"
          gap="base"
        >
          <Metric label="Synced products" value={productControls?.summary.total ?? 0} />
          <Metric label="Ready" value={productControls?.summary.ready ?? 0} />
          <Metric
            label="Disabled"
            value={productControls?.summary.disabled ?? 0}
          />
          <Metric
            label="Needs attention"
            value={productControls?.summary.needsAttention ?? 0}
          />
        </s-grid>

        {products.length > 0 ? (
          <s-stack gap="base">
            {products.map((product) => (
              <ProductControlRow key={product.externalProductId} product={product} />
            ))}
          </s-stack>
        ) : (
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
              <s-button href={syncActionPath} variant="secondary" icon="refresh">
                Sync catalog
              </s-button>
            </s-stack>
          </s-box>
        )}
      </s-stack>
    </s-section>
  );
}

function ProductControlRow({ product }: { product: SelfxProductControl }) {
  const canEnable = product.tryOnStatus === "DISABLED";
  const canDisable = product.tryOnStatus === "READY";
  return (
    <s-box
      padding="base"
      background="subdued"
      borderWidth="small"
      borderColor="base"
      borderRadius="base"
    >
      <s-grid gridTemplateColumns="minmax(0, 1fr) auto" gap="base" alignItems="center">
        <s-grid-item>
          <s-stack direction="inline" gap="base" alignItems="center">
            {product.imageUrl ? (
              <s-thumbnail
                src={product.imageUrl}
                alt={product.name}
                size="small"
              />
            ) : (
              <s-box
                padding="base"
                background="base"
                borderWidth="small"
                borderColor="base"
                borderRadius="base"
              >
                <s-icon type="product" />
              </s-box>
            )}
            <s-stack gap="small-200">
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-heading>{product.name}</s-heading>
                <ProductStatusBadge status={product.tryOnStatus} />
              </s-stack>
              <s-text color="subdued">
                {product.handle
                  ? `Handle: ${product.handle}`
                  : product.externalProductId}
              </s-text>
              <s-text color="subdued">{productStatusHelp(product)}</s-text>
            </s-stack>
          </s-stack>
        </s-grid-item>
        <s-grid-item>
          {canEnable || canDisable ? (
            <Form method="post">
              <input type="hidden" name="intent" value="setProductVto" />
              <input
                type="hidden"
                name="externalProductId"
                value={product.externalProductId}
              />
              <input
                type="hidden"
                name="enabled"
                value={canEnable ? "true" : "false"}
              />
              <s-button
                type="submit"
                variant={canEnable ? "primary" : "secondary"}
              >
                {canEnable ? "Enable Try-On" : "Disable Try-On"}
              </s-button>
            </Form>
          ) : (
            <s-button disabled variant="secondary">
              Enable unavailable
            </s-button>
          )}
        </s-grid-item>
      </s-grid>
    </s-box>
  );
}

function ProductStatusBadge({
  status,
}: {
  status: SelfxProductTryOnStatus;
}) {
  if (status === "READY") return <s-badge tone="success">Ready</s-badge>;
  if (status === "DISABLED") return <s-badge tone="neutral">Disabled</s-badge>;
  if (status === "INACTIVE") return <s-badge tone="warning">Inactive</s-badge>;
  if (status === "MISSING_IMAGE") {
    return <s-badge tone="warning">Missing image</s-badge>;
  }
  return <s-badge tone="warning">Not garment</s-badge>;
}

function productStatusHelp(product: SelfxProductControl): string {
  if (product.tryOnStatus === "READY") {
    return "Try-On is available on the storefront for this product.";
  }
  if (product.tryOnStatus === "DISABLED") {
    return "This eligible product is synced but Try-On is disabled.";
  }
  if (product.tryOnStatus === "INACTIVE") {
    return "This Shopify product is not active in the synced catalog.";
  }
  if (product.tryOnStatus === "MISSING_IMAGE") {
    return "Add a Shopify product image and sync again before enabling Try-On.";
  }
  return "Only garment products can be enabled for SelfX Try-On.";
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

function emptyThemeBlockView(
  status: ThemeBlockView["status"],
): ThemeBlockView {
  return {
    status,
    themeName: null,
    checkedFilenames: ["templates/product.json"],
    errorMessage: null,
  };
}

function themeBlockMeta(themeBlock: ThemeBlockView): string {
  if (themeBlock.status === "INSTALLED" && themeBlock.themeName) {
    return `Detected on ${themeBlock.themeName}`;
  }
  if (themeBlock.status === "NOT_INSTALLED" && themeBlock.themeName) {
    return `Checked ${themeBlock.themeName}: ${themeBlock.checkedFilenames.join(
      ", ",
    )}`;
  }
  return themeBlock.errorMessage ?? "Theme block status has not been checked.";
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

async function safeProductControls(
  shop: string,
  connection: SelfxConnectionView,
): Promise<ProductControlsView | null> {
  if (connection.status !== "CONNECTED") {
    return null;
  }
  try {
    return {
      ...(await (await productControlsClient(shop)).listProducts()),
      errorMessage: null,
    };
  } catch {
    return {
      data: [],
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
