import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";

import {
  completeSelfxConnection,
  getSelfxConnectionView,
  runSelfxCatalogSync,
  startSelfxConnection,
  type SelfxConnectionView,
} from "../selfx-connection.server";
import { SelfxLinkApiError } from "../selfx-link.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { connection: await safeConnectionView(session.shop) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  try {
    const input = {
      shop: session.shop,
      shopifyAccessToken: requiredAccessToken(session.accessToken),
    };
    const connection =
      intent === "connect"
        ? await startSelfxConnection(input)
        : intent === "complete"
          ? await completeSelfxConnection(input)
          : intent === "sync"
            ? await runSelfxCatalogSync(input)
            : await safeConnectionView(session.shop);
    return { ok: true, intent: String(intent ?? "view"), connection };
  } catch (error) {
    return {
      ok: false,
      intent: String(intent ?? "unknown"),
      connection: await safeConnectionView(session.shop),
      error: safeMessage(error),
    };
  }
};

export default function Index() {
  const loaded = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const connection = fetcher.data?.connection ?? loaded.connection;
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (
      connection.status !== "PENDING_APPROVAL" ||
      !connection.pendingLinkExpiresAt
    ) {
      return;
    }
    const interval = window.setInterval(() => {
      if (fetcher.state === "idle") {
        void fetcher.submit({ intent: "complete" }, { method: "post" });
      }
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [connection.pendingLinkExpiresAt, connection.status, fetcher]);

  const error = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;
  const pending = connection.status === "PENDING_APPROVAL";
  const connected = connection.status === "CONNECTED";

  function submit(intent: "connect" | "complete" | "sync") {
    void fetcher.submit({ intent }, { method: "post" });
  }

  return (
    <s-page heading="SelfX Virtual Try-On" inlineSize="large">
      {error ? (
        <s-banner heading="Connection could not be completed" tone="critical">
          {error}
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

      <s-section heading="Store connection">
        <s-stack gap="base">
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
            <s-grid-item>
              <s-stack gap="small-200">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-heading>SelfX Store</s-heading>
                  <ConnectionBadge status={connection.status} />
                </s-stack>
                <s-text color="subdued">
                  {connected
                    ? `Connected to ${connection.storeName ?? "SelfX"}`
                    : pending
                      ? "Waiting for approval in SelfX"
                      : "No SelfX Store connected"}
                </s-text>
                <s-text color="subdued">Shopify shop: {connection.shop}</s-text>
              </s-stack>
            </s-grid-item>
            <s-grid-item>
              {!connected && !pending ? (
                <s-button
                  variant="primary"
                  loading={busy}
                  onClick={() => submit("connect")}
                >
                  Connect SelfX
                </s-button>
              ) : null}
              {pending && connection.approvalUrl ? (
                <s-button
                  variant="primary"
                  href={connection.approvalUrl}
                  target="_blank"
                >
                  Approve in SelfX
                </s-button>
              ) : null}
            </s-grid-item>
          </s-grid>

          {pending ? (
            <s-banner heading="Approval is open" tone="info">
              Select an active Store in SelfX. This page checks for approval
              automatically; no API key needs to be copied.
            </s-banner>
          ) : null}

          {pending ? (
            <s-button
              variant="secondary"
              loading={busy}
              onClick={() => submit("complete")}
            >
              Check approval
            </s-button>
          ) : null}
        </s-stack>
      </s-section>

      <s-section heading="Catalog sync">
        <s-stack gap="base">
          <s-grid
            gridTemplateColumns="repeat(auto-fit, minmax(9rem, 1fr))"
            gap="base"
          >
            <Metric label="Products" value={connection.productsImported} />
            <Metric label="Variants" value={connection.variantsImported} />
            <Metric label="Created" value={connection.created} />
            <Metric label="Updated" value={connection.updated} />
            <Metric label="Archived" value={connection.archived} />
          </s-grid>
          <s-stack direction="inline" gap="base" alignItems="center">
            <SyncBadge status={connection.syncStatus} />
            <s-text color="subdued">
              {connection.lastSyncAt
                ? `Last synced ${formatDate(connection.lastSyncAt)}`
                : "No completed catalog sync yet"}
            </s-text>
          </s-stack>
          <s-button
            variant="secondary"
            icon="refresh"
            disabled={!connected}
            loading={busy && fetcher.formData?.get("intent") === "sync"}
            onClick={() => submit("sync")}
          >
            Sync catalog
          </s-button>
          <s-text color="subdued">
            Sync is read-only. Shopify remains the source of truth for products,
            prices, inventory, orders and store settings.
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Storefront">
        <s-stack gap="base">
          <s-text>
            After the catalog is synchronized, add the SelfX Try It On block to
            your product template from the Shopify theme editor.
          </s-text>
          <s-button variant="secondary" disabled={!connected}>
            Add Try-On block
          </s-button>
        </s-stack>
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

function requiredAccessToken(value: string | undefined): string {
  const clean = value?.trim();
  if (!clean) throw new Error("Shopify authentication must be refreshed.");
  return clean;
}

function safeMessage(error: unknown): string {
  if (error instanceof SelfxLinkApiError) {
    const trustedError = error as SelfxLinkApiError;
    return trustedError.message;
  }

  return "The SelfX connection could not be completed. Try again.";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
