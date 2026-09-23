import { randomBytes } from "node:crypto";

import type { LoaderFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import {
  storefrontTryOnErrorMarkup,
  storefrontTryOnRedirectMarkup,
} from "../selfx-storefront-error.server";
import {
  normalizeLanguageLocale,
  normalizeStorefrontLocale,
} from "../selfx-localization";
import { loadSelfxLinkConfig, SelfxLinkApiError } from "../selfx-link.server";
import {
  buildStorefrontTryOnSessionUrl,
  productReference,
  SelfxStorefrontTryOnClient,
} from "../selfx-storefront-tryon.server";

type AppProxyContext = Awaited<ReturnType<typeof authenticate.public.appProxy>>;

const visitorCookieName = "selfx_tryon_visitor";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let context: AppProxyContext | null = null;
  const logContext: {
    shop?: string | null;
    externalProductId?: string | null;
    productHandle?: string | null;
  } = {};
  try {
    context = await authenticate.public.appProxy(request);
    const url = new URL(request.url);
    const shop = normalizeShopDomain(
      context.session?.shop ?? url.searchParams.get("shop"),
    );
    logContext.shop = shop;

    if (!shop) {
      return launchError(context, {
        message: "SelfX could not verify this Shopify store.",
        status: 400,
      });
    }

    const connection = await db.selfxConnection.findUnique({
      where: { shop },
      select: {
        status: true,
        storefrontLocale: true,
        visitorTryOnLimit: true,
        visitorTryOnLimitPeriod: true,
        monthlyStoreTryOnLimit: true,
      },
    });

    if (connection?.status !== "CONNECTED") {
      return launchError(context, {
        message: "SelfX Try-On is not connected for this store yet.",
        status: 403,
      });
    }

    const product = productReference(url.searchParams);
    logContext.externalProductId = product.externalProductId;
    logContext.productHandle = product.productHandle;
    if (!product.externalProductId && !product.productHandle) {
      return launchError(context, {
        message: "SelfX could not identify this Shopify product.",
        status: 400,
      });
    }

    const launchBaseUrl = storefrontTryOnBaseUrl();
    if (!launchBaseUrl) {
      return launchError(context, {
        message: "SelfX Try-On launch is not configured yet.",
        status: 503,
      });
    }

    const client = new SelfxStorefrontTryOnClient(loadSelfxLinkConfig());
    const requestedLocale = normalizeLanguageLocale(
      url.searchParams.get("locale"),
    );
    const configuredLocale = normalizeStorefrontLocale(
      connection.storefrontLocale,
    );
    const locale =
      configuredLocale === "auto" ? requestedLocale : configuredLocale;
    const visitor = visitorToken(request);
    const session = await client.createSession({
      source: "shopify",
      shop,
      locale,
      visitorToken: visitor.value,
      visitorTryOnLimit: normalizeLimit(connection.visitorTryOnLimit),
      visitorTryOnLimitPeriod: normalizeLimitPeriod(
        connection.visitorTryOnLimitPeriod,
      ),
      monthlyStoreTryOnLimit: normalizeLimit(connection.monthlyStoreTryOnLimit),
      ...(product.externalProductId
        ? { externalProductId: product.externalProductId }
        : {}),
      ...(product.productHandle
        ? { productHandle: product.productHandle }
        : {}),
    });
    const targetUrl = buildStorefrontTryOnSessionUrl({
      baseUrl: launchBaseUrl,
      session: session.session,
      shop,
      productId: product.externalProductId,
      productHandle: product.productHandle,
      locale,
    });
    const response = htmlResponse(storefrontTryOnRedirectMarkup(targetUrl));
    if (visitor.setCookie) {
      response.headers.append("Set-Cookie", visitor.setCookie);
    }
    return response;
  } catch (error) {
    console.error(
      "SelfX storefront Try-On launch failed",
      safeErrorLog(error, logContext),
    );
    if (context) {
      return launchError(context, {
        message: messageForLaunchError(error),
        status: statusForLaunchError(error),
      });
    }
    return new Response(
      storefrontTryOnErrorMarkup(
        "SelfX Try-On could not verify this storefront request. Return to the product page and try again.",
      ),
      {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }
};

export default function SelfxTryOnLaunchRoute(): null {
  return null;
}

function visitorToken(request: Request): {
  value: string;
  setCookie: string | null;
} {
  const existing = parseCookie(request.headers.get("cookie"))[
    visitorCookieName
  ];
  if (existing && /^[A-Za-z0-9_-]{43}$/.test(existing)) {
    return { value: existing, setCookie: null };
  }
  const value = randomBytes(32).toString("base64url");
  return {
    value,
    setCookie: [
      `${visitorCookieName}=${value}`,
      "Path=/apps/selfx-tryon",
      "Max-Age=31536000",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
    ].join("; "),
  };
}

function parseCookie(header: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of header?.split(";") ?? []) {
    const [name, ...valueParts] = part.trim().split("=");
    if (!name || valueParts.length === 0) continue;
    result[name] = decodeURIComponent(valueParts.join("="));
  }
  return result;
}

function normalizeLimit(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(Math.floor(parsed), 1_000_000);
}

function normalizeLimitPeriod(value: unknown): "DAY" | "WEEK" | "MONTH" {
  const clean = String(value ?? "")
    .trim()
    .toUpperCase();
  return clean === "WEEK" || clean === "MONTH" ? clean : "DAY";
}

function storefrontTryOnBaseUrl(): string | null {
  // eslint-disable-next-line no-undef
  const explicit = cleanEnv(process.env.SELFX_STOREFRONT_TRYON_URL);
  if (explicit) return validLaunchUrl(explicit);

  // eslint-disable-next-line no-undef
  const webBase = cleanEnv(process.env.SELFX_WEB_BASE_URL);
  if (!webBase) return null;

  const url = validLaunchUrl(webBase);
  if (!url) return null;

  return new URL("/try-on/shopify", url).toString();
}

function normalizeShopDomain(value: string | null | undefined): string | null {
  const clean = value?.trim().toLowerCase();
  return clean && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(clean)
    ? clean
    : null;
}

function validLaunchUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const local =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    return null;
  }
  url.hash = "";
  return url.toString();
}

function cleanEnv(value: string | undefined): string | null {
  const clean = value?.trim();
  return clean || null;
}

function messageForLaunchError(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "SHOPIFY_STOREFRONT_TRYON_PRODUCT_NOT_ENABLED"
  ) {
    return "This product is not enabled for SelfX Try-On yet.";
  }
  if (
    error instanceof SelfxLinkApiError &&
    error.code === "SHOPIFY_STOREFRONT_TRYON_PRODUCT_UNAVAILABLE"
  ) {
    return "This product is not available for SelfX Try-On right now.";
  }
  if (
    error instanceof SelfxLinkApiError &&
    error.code === "SHOPIFY_STOREFRONT_TRYON_MONTHLY_LIMIT_REACHED"
  ) {
    return "This store has reached its monthly SelfX Try-On limit.";
  }
  if (
    error instanceof SelfxLinkApiError &&
    error.code === "SHOPIFY_STOREFRONT_TRYON_VISITOR_LIMIT_REACHED"
  ) {
    return "You have reached this store's Try-On limit for now.";
  }
  return "SelfX Try-On could not be started for this product yet.";
}

function statusForLaunchError(error: unknown): number {
  if (error instanceof SelfxLinkApiError) {
    return error.status >= 400 && error.status < 500 ? error.status : 503;
  }
  return 503;
}

function launchError(
  _context: AppProxyContext,
  input: { message: string; status: number },
): Response {
  return htmlResponse(storefrontTryOnErrorMarkup(input.message), input.status);
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function safeErrorLog(
  error: unknown,
  context: {
    shop?: string | null;
    externalProductId?: string | null;
    productHandle?: string | null;
  } = {},
): Record<string, unknown> {
  if (error instanceof Error) {
    const maybeApiError =
      error instanceof SelfxLinkApiError
        ? { code: error.code, status: error.status }
        : {};
    return {
      name: error.name,
      message: error.message,
      shop: context.shop ?? undefined,
      externalProductId: context.externalProductId ?? undefined,
      productHandle: context.productHandle ?? undefined,
      ...maybeApiError,
    };
  }
  return {
    name: "UnknownError",
    message: String(error),
    shop: context.shop ?? undefined,
    externalProductId: context.externalProductId ?? undefined,
    productHandle: context.productHandle ?? undefined,
  };
}
