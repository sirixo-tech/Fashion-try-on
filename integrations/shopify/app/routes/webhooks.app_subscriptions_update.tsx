import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { syncShopifyBilling } from "../selfx-billing.server";
export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await authenticate.webhook(request);
  try {
    const { admin } = await unauthenticated.admin(shop);
    await syncShopifyBilling(shop, admin);
    return new Response(null, { status: 200 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
