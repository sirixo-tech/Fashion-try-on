import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

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
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
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

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

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
