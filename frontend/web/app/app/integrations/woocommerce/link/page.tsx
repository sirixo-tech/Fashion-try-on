import { WooCommerceLinkApprovalPage } from "@/components/woocommerce-link-approval-page";

export default async function WooCommerceLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return <WooCommerceLinkApprovalPage linkToken={token} />;
}
