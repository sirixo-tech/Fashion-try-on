import { useEffect, useState, type ReactNode } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useLocation } from "react-router";

import {
  getSelfxConnectionView,
  type SelfxConnectionView,
} from "../selfx-connection.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return {
    connection: await safeConnectionView(session.shop),
    themeEditorUrl: buildTryOnBlockThemeEditorUrl(session.shop),
  };
};

export default function Index() {
  const loaded = useLoaderData<typeof loader>();
  const location = useLocation();
  const [actionError, setActionError] = useState<string | null>(null);
  const connection = loaded.connection;
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
                title={connected && synced ? "Ready to launch" : "Setup in progress"}
                body={
                  connected && synced
                    ? "Catalog sync is complete and the storefront block can be added."
                    : "Complete connection and sync before enabling shopper Try-On."
                }
                meta={
                  connection.lastSyncAt
                    ? `Last synced ${formatDate(connection.lastSyncAt)}`
                    : "No completed catalog sync yet"
                }
                badge={<SyncBadge status={connection.syncStatus} />}
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
                complete={connected && synced}
                pending={!connected || !synced}
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
                    Open the Shopify theme editor and place the SelfX Try It On
                    block on your product template.
                  </s-text>
                </s-stack>
                <s-button
                  variant="primary"
                  href={themeEditorUrl ?? undefined}
                  target="_blank"
                  disabled={!connected || !themeEditorUrl}
                >
                  Add Try-On block
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

function normalizeShopDomain(shop: string): string | null {
  const clean = shop.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(clean) ? clean : null;
}
