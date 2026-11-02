"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceLoading } from "@/components/workspace-loading";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { getCurrentMerchantStoreAccess } from "@/lib/current-store";
import { canSeeHref, navigationAccess } from "@/lib/navigation-access";
import { useSession } from "@/lib/session";

const integrationRoutes = [
  "/app/integrations/shopify",
  "/app/integrations/woocommerce",
  "/app/integrations/store-qr",
];

export default function IntegrationsPage() {
  const router = useRouter();
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const hasPlatformAccess =
    session.status === "authenticated" && session.user.hasPlatformAccess;

  useEffect(() => {
    if (!accessToken) return;
    const token = accessToken;
    let cancelled = false;

    async function openFirstAvailableIntegration() {
      const [platformResult, storeResult] = await Promise.allSettled([
        getCurrentPlatformAccess(token),
        getCurrentMerchantStoreAccess(token),
      ]);
      if (cancelled) return;

      const platformAccess =
        platformResult.status === "fulfilled" ? platformResult.value : null;
      const storeContext =
        storeResult.status === "fulfilled" ? storeResult.value : null;
      const impersonating =
        storeContext?.impersonation !== null &&
        storeContext?.impersonation !== undefined;
      const access = navigationAccess({
        sessionHasPlatformAccess: impersonating ? false : hasPlatformAccess,
        platformAccess: impersonating ? null : platformAccess,
        storeAccess: storeContext?.permissions ?? null,
        hasActiveStore:
          storeContext?.store !== null && storeContext?.store !== undefined,
      });
      const route = integrationRoutes.find((candidate) =>
        canSeeHref(candidate, access),
      );

      router.replace(route ?? "/app/dashboard");
    }

    void openFirstAvailableIntegration();
    return () => {
      cancelled = true;
    };
  }, [accessToken, hasPlatformAccess, router]);

  return (
    <WorkspaceLoading
      description="Opening integrations…"
      fullScreen={false}
    />
  );
}
