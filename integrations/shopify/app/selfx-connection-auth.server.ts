import db from "./db.server";
import { authenticate } from "./shopify.server";
import { ShopifyAdminApiError } from "../src/shopify-admin.server.js";

type AdminContext = Awaited<ReturnType<typeof authenticate.admin>>;
type ConnectionInput = { shop: string; shopifyAccessToken: string };

// Only initial linking/reconnection calls use this helper. Their first native
// operation is the read-only shop identity query, before issuing a link session.
export async function withShopifyConnectionRecovery<T>(
  request: Request,
  authenticated: AdminContext,
  operation: (input: ConnectionInput) => Promise<T>,
): Promise<T> {
  const input = connectionInput(authenticated);
  try {
    return await operation(input);
  } catch (error) {
    if (!(error instanceof ShopifyAdminApiError) || error.status !== 401)
      throw error;
  }

  // A stale token can survive an uninstall delivered directly to the central
  // API. Never remove a concurrently refreshed session or any Store data.
  await db.session.deleteMany({
    where: {
      id: authenticated.session.id,
      shop: authenticated.session.shop,
      accessToken: input.shopifyAccessToken,
    },
  });
  // Let the SDK validate the merchant session again and perform token exchange.
  // Preserve its redirects/retry responses; never mint authority from shop alone.
  const refreshed = await authenticate.admin(request);
  if (refreshed.session.shop !== authenticated.session.shop) {
    throw new Error("Shopify returned an unexpected shop identity.");
  }
  return operation(connectionInput(refreshed));
}

function connectionInput(context: AdminContext): ConnectionInput {
  const token = context.session.accessToken?.trim();
  if (!token) throw new Error("Shopify authentication must be refreshed.");
  return { shop: context.session.shop, shopifyAccessToken: token };
}
