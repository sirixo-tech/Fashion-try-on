"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageContainer, PageHeader, PageSection } from "@selfx/ui";
import { StoreMobileQr } from "@/components/store-mobile-qr";
import { getCurrentMerchantStoreAccess } from "@/lib/current-store";
import { useSession } from "@/lib/session";
import { SafeApiError } from "@/lib/api";

export function StoreQrIntegrationPage() {
  const session = useSession();
  return session.status === "authenticated" ? (
    <AuthorizedStoreQrPage
      key={session.accessToken}
      accessToken={session.accessToken}
    />
  ) : null;
}

function AuthorizedStoreQrPage({ accessToken }: { accessToken: string }) {
  const [store, setStore] = useState<{
    id: string;
    name: string;
    canView: boolean;
    canManage: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getCurrentMerchantStoreAccess(accessToken)
      .then(({ store: current, permissions }) => {
        if (cancelled) return;
        if (!current) {
          setError("Select or impersonate a Store to manage its Store QR.");
          return;
        }
        const codes = permissions?.permissions ?? [];
        const bypass = permissions?.platformBypass ?? false;
        const canView = bypass || codes.includes("integrations.view");
        if (!canView) {
          setError("You do not have permission to view this Store’s integrations.");
          return;
        }
        setStore({
          id: current.id,
          name: current.name,
          canView,
          canManage: bypass || codes.includes("integrations.manage"),
        });
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof SafeApiError
            ? caught.message
            : "Store access could not be loaded.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Integrations"
        title="Store QR"
        description={
          store
            ? `Mobile Try-On access codes for ${store.name}.`
            : "Manage mobile Store access codes."
        }
      />
      {store?.canView ? (
        <PageSection>
          <StoreMobileQr
            key={store.id}
            accessToken={accessToken}
            storeId={store.id}
            canManage={store.canManage}
          />
        </PageSection>
      ) : error ? (
        <PageSection>
          <div className="space-y-3">
            <p role="alert" className="text-sm text-muted-foreground">
              {error}
            </p>
            {error.startsWith("Select or impersonate") ? (
              <Link
                href="/app/stores"
                className="text-sm font-medium underline underline-offset-4"
              >
                Open Stores
              </Link>
            ) : null}
          </div>
        </PageSection>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Loading Store access…
        </p>
      )}
    </PageContainer>
  );
}
