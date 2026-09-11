import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { loadSelfxLinkConfig } from "../selfx-link.server";
import {
  buildStorefrontTryOnSessionUrl,
  productReference,
  SelfxStorefrontTryOnClient,
} from "../selfx-storefront-tryon.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const context = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const shop = normalizeShopDomain(
    context.session?.shop ?? url.searchParams.get("shop"),
  );

  if (!shop) {
    return context.liquid(errorMarkup("SelfX could not verify this shop."), {
      status: 400,
      layout: false,
    });
  }

  const connection = await db.selfxConnection.findUnique({
    where: { shop },
    select: { status: true },
  });

  if (connection?.status !== "CONNECTED") {
    return context.liquid(
      errorMarkup("SelfX Try-On is not connected for this store yet."),
      { status: 403, layout: false },
    );
  }

  const product = productReference(url.searchParams);
  if (!product.externalProductId && !product.productHandle) {
    return context.liquid(
      errorMarkup("SelfX could not identify this Shopify product."),
      { status: 400, layout: false },
    );
  }

  const launchBaseUrl = storefrontTryOnBaseUrl();
  if (!launchBaseUrl) {
    return context.liquid(
      errorMarkup("SelfX Try-On launch is not configured yet."),
      { status: 503, layout: false },
    );
  }

  try {
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
    return context.liquid(errorMarkup(messageForLaunchError(error)), {
      status: 503,
      layout: false,
    });
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
  return "SelfX Try-On could not be started for this product yet.";
}

function errorMarkup(message: string): string {
  return `
    <main style="padding: 2rem; font-family: system-ui, sans-serif;">
      <h1 style="font-size: 1.25rem; margin: 0 0 0.75rem;">SelfX Try-On</h1>
      <p style="margin: 0;">${escapeHtml(message)}</p>
    </main>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
