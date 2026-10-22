import { StoreProductEditor } from "@/components/store-product-editor";
export default async function Page({
  params,
}: {
  params: Promise<{ storeId: string; productId: string }>;
}) {
  return <StoreProductEditor {...await params} />;
}
