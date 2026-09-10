import { ShopifyLinkApprovalPage } from "@/components/shopify-link-approval-page";

export default async function ShopifyLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return <ShopifyLinkApprovalPage linkToken={token} />;
}
