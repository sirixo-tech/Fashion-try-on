"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ErrorState, LoadingState } from "@selfx/ui";
import {
  getCurrentMerchantStoreAccess,
  hasStoreResourcePermission,
  type CurrentStoreAccess,
} from "@/lib/current-store";
import { useSession } from "@/lib/session";
import { StoreProductsCatalog } from "@/components/store-products-catalog";

export default function ProductsPage() {
  const pathname = usePathname();
  const session = useSession();
  const token = session.status === "authenticated" ? session.accessToken : null;
  const [context, setContext] = useState<CurrentStoreAccess | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("selfx:impersonation-changed", refresh);
    return () =>
      window.removeEventListener("selfx:impersonation-changed", refresh);
  }, []);
  useEffect(() => {
    if (!token) return;
    let active = true;
    setContext(null);
    setError(false);
    getCurrentMerchantStoreAccess(token)
      .then((access) => {
        if (active) setContext(access);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [token, revision]);
  if (error)
    return (
      <ErrorState
        title="Store access unavailable"
        description="Unable to load your current Store. Reload to try again."
      />
    );
  if (!context) return <LoadingState label="Loading Store catalog" />;
  if (
    !context.store ||
    !hasStoreResourcePermission(context.permissions, "stores.view")
  ) {
    return (
      <ErrorState
        title="Store access required"
        description="Select a Store account with permission to view its products."
      />
    );
  }
  const vertical = pathname.endsWith("/jewellery") ? "JEWELLERY" : "GARMENT";
  return (
    <StoreProductsCatalog
      key={`${context.store.id}:${vertical}`}
      storeId={context.store.id}
      defaultVertical={vertical}
      merchantWorkspace
    />
  );
}
