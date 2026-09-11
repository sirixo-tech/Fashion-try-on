import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import {
  completeSelfxConnection,
  getSelfxConnectionView,
  restartSelfxConnection,
  runSelfxCatalogSync,
  startSelfxConnection,
} from "../selfx-connection.server";
import { SelfxLinkApiError } from "../selfx-link.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const { session } = await authenticate.admin(request);
  const intent = url.searchParams.get("selfxIntent");

  try {
    const input = {
      shop: session.shop,
      shopifyAccessToken: requiredAccessToken(session.accessToken),
    };

    if (intent === "connect") {
      await startSelfxConnection(input);
    } else if (intent === "complete") {
      await completeSelfxConnection(input);
    } else if (intent === "restart") {
      await restartSelfxConnection(session.shop);
    } else if (intent === "sync") {
      await runSelfxCatalogSync(input);
    } else {
      await getSelfxConnectionView(session.shop);
    }

    return redirectToApp(request);
  } catch (error) {
    console.error("SelfX Shopify action failed", {
      intent: safeIntent(intent),
      ...safeErrorLogDetails(error),
    });
    return redirectToApp(request, safeMessage(error));
  }
};

export default function SelfxActionRoute(): null {
  return null;
}

function redirectToApp(request: Request, error?: string) {
  const requestUrl = new URL(request.url);
  const signedQuerySegments = requestUrl.search
    .slice(1)
    .split("&")
    .filter((segment) => segment && !segment.startsWith("selfxIntent="));
  const signedSearch = signedQuerySegments.length
    ? `?${signedQuerySegments.join("&")}`
    : "";
  const fragment = error ? `#selfxError=${encodeURIComponent(error)}` : "";
  return redirect(`/app${signedSearch}${fragment}`);
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

function safeIntent(intent: string | null): string {
  return intent === "connect" ||
    intent === "complete" ||
    intent === "restart" ||
    intent === "sync"
    ? intent
    : "unknown";
}

function safeErrorLogDetails(error: unknown): {
  name: string;
  message: string;
  code?: string;
} {
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof record?.code === "string" ? record.code : undefined;

  return {
    name: redactSensitiveLogText(name),
    message: redactSensitiveLogText(message),
    ...(code ? { code: redactSensitiveLogText(code) } : {}),
  };
}

function redactSensitiveLogText(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(
      /\b(id_token|access_token|hmac|token|secret)=([^\s&]+)/gi,
      "$1=[redacted]",
    )
    .slice(0, 1_000);
}
