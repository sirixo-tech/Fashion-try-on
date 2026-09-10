import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";

import {
  completeSelfxConnection,
  getSelfxConnectionView,
  runSelfxCatalogSync,
  startSelfxConnection,
} from "../selfx-connection.server";
import { SelfxLinkApiError } from "../selfx-link.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  try {
    const input = {
      shop: session.shop,
      shopifyAccessToken: requiredAccessToken(session.accessToken),
    };

    if (intent === "connect") {
      await startSelfxConnection(input);
    } else if (intent === "complete") {
      await completeSelfxConnection(input);
    } else if (intent === "sync") {
      await runSelfxCatalogSync(input);
    } else {
      await getSelfxConnectionView(session.shop);
    }

    return redirectToApp(request);
  } catch (error) {
    return redirectToApp(request, safeMessage(error));
  }
};

function redirectToApp(request: Request, error?: string) {
  const requestUrl = new URL(request.url);
  const fragment = error ? `#selfxError=${encodeURIComponent(error)}` : "";
  return redirect(`/app${requestUrl.search}${fragment}`);
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
