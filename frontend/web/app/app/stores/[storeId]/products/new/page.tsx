import { StoreProductEditor } from "@/components/store-product-editor";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ vertical?: string }>;
}) {
  const { storeId } = await params;
  const { vertical } = await searchParams;
  return (
    <StoreProductEditor
      storeId={storeId}
      vertical={vertical === "JEWELLERY" ? "JEWELLERY" : "GARMENT"}
    />
  );
}
