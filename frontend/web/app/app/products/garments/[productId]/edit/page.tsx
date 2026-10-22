import { StoreProductEditor } from "@/components/store-product-editor";
export default async function Page({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return <StoreProductEditor productId={productId} />;
}
