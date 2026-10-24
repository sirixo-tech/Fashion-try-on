"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
  SectionCard,
  SelectMenu,
} from "@selfx/ui";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { getCurrentMerchantStoreAccess, hasCurrentStorePermission } from "@/lib/current-store";
import { listActiveOrganizations } from "@/lib/organizations";
import {
  approveWooCommerceLink,
  getWooCommerceLinkDetails,
  type WooCommerceLinkDetails,
} from "@/lib/integrations";
import { useSession } from "@/lib/session";
import { listStores } from "@/lib/stores";

export function WooCommerceLinkApprovalPage({ linkToken }: { linkToken: string }) {
  const session = useSession();
  const [details, setDetails] = useState<WooCommerceLinkDetails | null>(null);
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  const [storeId, setStoreId] = useState("");
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.status !== "authenticated") return;
    if (!/^[A-Za-z0-9_-]{43}$/.test(linkToken)) {
      setError("This connection link is invalid.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      getWooCommerceLinkDetails(session.accessToken, linkToken),
      getCurrentPlatformAccess(session.accessToken),
    ])
      .then(async ([nextDetails, platform]) => {
        if (cancelled) return;
        setDetails(nextDetails);
        if (nextDetails.status !== "PENDING") return;
        if (platform.isSuperadmin || platform.permissions.includes("INTEGRATIONS_MANAGE")) {
          const result = await listStores(session.accessToken, { pageSize: 100, status: "ACTIVE" });
          if (cancelled) return;
          const options = result.data.map((store) => ({ id: store.id, name: store.name }));
          setStores(options);
          setStoreId(options[0]?.id ?? "");
        } else {
          const current = await getCurrentMerchantStoreAccess(session.accessToken);
          if (cancelled) return;
          const available = await listActiveOrganizations(session.accessToken);
          if (cancelled) return;
          const options = available.map((store) => ({ id: store.id, name: store.name }));
          setStores(options);
          setStoreId(current.store && hasCurrentStorePermission(current.permissions, ["integrations.manage"])
            ? current.store.id : options[0]?.id ?? "");
        }
      })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "Connection unavailable."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [linkToken, session.accessToken, session.status]);

  async function approve() {
    if (session.status !== "authenticated" || !storeId || approving) return;
    setApproving(true);
    setError(null);
    try {
      setDetails(await approveWooCommerceLink(session.accessToken, linkToken, storeId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Connection could not be approved.");
    } finally {
      setApproving(false);
    }
  }

  if (loading || session.status === "loading") return <LoadingState label="Loading WooCommerce connection" />;
  if (!details) return <PageContainer width="form"><ErrorState title="Connection unavailable" description={error ?? "Start again in WooCommerce."} /></PageContainer>;
  const completed = details.status !== "PENDING";
  return (
    <PageContainer width="form">
      <PageHeader eyebrow="WooCommerce connection" title={completed ? "Website approved" : "Connect WooCommerce to SelfX"}
        description={completed ? "Return to WooCommerce to complete the connection and start catalog sync." : "Approve this website for the SelfX Store that should receive its products."} />
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <SectionCard>
        <div className="space-y-5">
          <p className="break-all text-sm"><strong>Website:</strong> {details.siteUrl}</p>
          {completed ? (
            <div className="space-y-3 text-sm"><p>Approved for {details.storeName}.</p><Button onClick={() => { window.location.href = details.adminUrl; }}>Return to WooCommerce</Button></div>
          ) : stores.length ? (
            <>
              <label className="block space-y-2 text-sm">SelfX Store
                <SelectMenu ariaLabel="SelfX Store" value={storeId} options={stores.map((store) => ({ value: store.id, label: store.name }))} onChange={setStoreId} />
              </label>
              <p className="text-sm text-muted-foreground">WooCommerce keeps control of products, prices, inventory, cart and checkout. SelfX imports products for Try-On.</p>
              <Button disabled={!storeId || approving} onClick={() => void approve()}>{approving ? "Approving..." : "Approve connection"}</Button>
            </>
          ) : (
            <Alert><AlertDescription>An active SelfX Store with integration management permission is required. Create a SelfX account or ask your Store administrator for access.</AlertDescription></Alert>
          )}
        </div>
      </SectionCard>
    </PageContainer>
  );
}
