"use client";

import { useParams } from "next/navigation";
import { StoreProductsCatalog } from "@/components/store-products-catalog";

export default function StoreProductsPage() {
  const params = useParams<{ storeId: string }>();
  return <StoreProductsCatalog key={params.storeId} storeId={params.storeId} />;
}
