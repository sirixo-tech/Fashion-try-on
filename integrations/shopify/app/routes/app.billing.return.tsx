import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { syncShopifyBilling } from "../selfx-billing.server";
export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin, redirect } = await authenticate.admin(request);
  // The query string is never proof of approval; read Shopify server-side.
  await syncShopifyBilling(session.shop, admin);
  return redirect("/app?panel=plans");
}
export default function BillingReturn() {
  return null;
}
