import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { storefrontTryOnErrorMarkup } from "../selfx-storefront-error.server";
import { loadSelfxLinkConfig, SelfxLinkApiError } from "../selfx-link.server";
import {
  buildStorefrontTryOnSessionUrl,
  productReference,
  SelfxStorefrontTryOnClient,
} from "../selfx-storefront-tryon.server";

type AppProxyContext = Awaited<ReturnType<typeof authenticate.public.appProxy>>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let context: AppProxyContext | null = null;
  try {
    context = await authenticate.public.appProxy(request);
    const url = new URL(request.url);
    const shop = normalizeShopDomain(
      context.session?.shop ?? url.searchParams.get("shop"),
    );

    if (!shop) {
      return launchError(context, {
        message: "SelfX could not verify this Shopify store.",
        status: 400,
      });
    }

    const connection = await db.selfxConnection.findUnique({
      where: { shop },
      select: { status: true },
    });

    if (connection?.status !== "CONNECTED") {
      return launchError(context, {
        message: "SelfX Try-On is not connected for this store yet.",
        status: 403,
      });
    }

    const product = productReference(url.searchParams);
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
    const session = await client.createSession({
      source: "shopify",
      shop,
      ...(product.externalProductId
        ? { externalProductId: product.externalProductId }
        : {}),
      ...(product.productHandle ? { productHandle: product.productHandle } : {}),
    });
    return redirect(
      buildStorefrontTryOnSessionUrl({
        baseUrl: launchBaseUrl,
        session: session.session,
      }),
    );
  } catch (error) {
    console.error("SelfX storefront Try-On launch failed", safeErrorLog(error));
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
  return "SelfX Try-On could not be started for this product yet.";
}

function statusForLaunchError(error: unknown): number {
  if (error instanceof SelfxLinkApiError) {
    return error.status >= 400 && error.status < 500 ? error.status : 503;
  }
  return 503;
}

function launchError(
  context: AppProxyContext,
  input: { message: string; status: number },
): Response {
  return context.liquid(storefrontTryOnErrorMarkup(input.message), {
    status: input.status,
    layout: false,
  });
}

function safeErrorLog(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const maybeApiError =
      error instanceof SelfxLinkApiError
        ? { code: error.code, status: error.status }
        : {};
    return {
      name: error.name,
      message: error.message,
      ...maybeApiError,
    };
  }
  return { name: "UnknownError", message: String(error) };
}
