"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  LinkIcon,
  ShieldCheckIcon,
  StoreIcon,
} from "lucide-react";

import {
  Alert,
  AlertDescription,
  Button,
  ErrorState,
  Label,
  LoadingState,
  PageContainer,
  PageHeader,
  SectionCard,
  SelectMenu,
  StatusBadge,
} from "@selfx/ui";

import {
  getCurrentPlatformAccess,
  type CurrentPlatformAccess,
} from "@/lib/access-control";
import { SafeApiError } from "@/lib/api";
import {
  approveShopifyLink,
  getShopifyLinkDetails,
  type ShopifyLinkApproval,
  type ShopifyLinkDetails,
} from "@/lib/integrations";
import { listActiveOrganizations } from "@/lib/organizations";
import { useSession } from "@/lib/session";
import { getEffectiveStorePermissions, listStores } from "@/lib/stores";

type StoreOption = { id: string; name: string };

export function ShopifyLinkApprovalPage({ linkToken }: { linkToken: string }) {
  const session = useSession();
  const [details, setDetails] = useState<ShopifyLinkDetails | null>(null);
  const [approval, setApproval] = useState<ShopifyLinkApproval | null>(null);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.status !== "authenticated") return;
    if (!/^[A-Za-z0-9_-]{43}$/.test(linkToken)) {
      setError("This Shopify approval link is invalid.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getShopifyLinkDetails(session.accessToken, linkToken),
      getCurrentPlatformAccess(session.accessToken),
    ])
      .then(async ([nextDetails, platformAccess]) => {
        if (cancelled) return;
        setDetails(nextDetails);
        if (nextDetails.status !== "PENDING") return;
        const manageableStores = await loadManageableStores(
          session.accessToken,
          platformAccess,
        );
        if (cancelled) return;
        setStores(manageableStores);
        setSelectedStoreId(manageableStores[0]?.id ?? "");
      })
      .catch((caught) => {
        if (!cancelled) setError(messageFor(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [linkToken, session.accessToken, session.status]);

  async function approve() {
    if (session.status !== "authenticated" || !selectedStoreId || approving) {
      return;
    }
    setApproving(true);
    setError(null);
    try {
      const result = await approveShopifyLink(
        session.accessToken,
        linkToken,
        selectedStoreId,
      );
      setApproval(result);
      setDetails((current) =>
        current ? { ...current, status: result.status } : current,
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setApproving(false);
    }
  }

  if (loading || session.status === "loading") {
    return <LoadingState label="Loading Shopify connection" />;
  }
  if (error && !details) {
    return (
      <PageContainer width="form">
        <ErrorState
          title="Shopify connection unavailable"
          description={error}
          action={{
            label: "Back to Shopify settings",
            href: "/app/integrations/shopify",
          }}
        />
      </PageContainer>
    );
  }

  const completed =
    approval ||
    details?.status === "APPROVED" ||
    details?.status === "REDEEMED";

  return (
    <PageContainer width="form">
      <PageHeader
        eyebrow="Shopify connection"
        title={completed ? "Store connected" : "Connect Shopify to SelfX"}
        description={
          completed
            ? "SelfX has approved the connection. The Shopify app can now finish setup and synchronize the catalog."
            : "Choose the SelfX Store that should receive products from this Shopify shop."
        }
        status={
          <StatusBadge
            status={completed ? "APPROVED" : "PENDING_ACTIVATION"}
            label={completed ? "Approved" : "Approval required"}
          />
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <SectionCard>
        {completed ? (
          <div className="flex flex-col items-center gap-5 py-5 text-center">
            <div className="flex size-12 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2Icon size={26} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Connection approved</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {approval
                  ? `${details?.externalAccountName ?? details?.shopDomain} is linked to ${approval.storeName}.`
                  : "This connection has already been approved."}
              </p>
            </div>
            <Button onClick={() => window.close()}>
              <ArrowLeftIcon aria-hidden="true" />
              Return to Shopify
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 rounded-lg border bg-muted/25 p-4 sm:grid-cols-2">
              <ConnectionDetail
                icon={<StoreIcon aria-hidden="true" />}
                label="Shopify shop"
                value={
                  details?.externalAccountName ??
                  details?.shopDomain ??
                  "Shopify"
                }
              />
              <ConnectionDetail
                icon={<LinkIcon aria-hidden="true" />}
                label="Shop domain"
                value={details?.shopDomain ?? "-"}
              />
            </div>

            {stores.length ? (
              <div className="space-y-2">
                <Label htmlFor="shopify-link-store">SelfX Store</Label>
                <SelectMenu
                  id="shopify-link-store"
                  ariaLabel="SelfX Store"
                  value={selectedStoreId}
                  options={stores.map((store) => ({
                    value: store.id,
                    label: store.name,
                  }))}
                  onChange={setSelectedStoreId}
                />
              </div>
            ) : (
              <Alert>
                <AlertDescription>
                  You do not have permission to manage integrations for an
                  active SelfX Store.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-start gap-3 rounded-lg border p-4 text-sm text-muted-foreground">
              <ShieldCheckIcon
                className="mt-0.5 shrink-0 text-primary"
                size={18}
                aria-hidden="true"
              />
              <p className="leading-6">
                SelfX receives a read-only copy for Try-On. Shopify remains the
                source of truth and SelfX cannot edit Shopify products,
                inventory, orders or settings.
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                render={<a href="/app/integrations/shopify" />}
              >
                Cancel
              </Button>
              <Button
                disabled={!selectedStoreId || approving}
                onClick={() => void approve()}
              >
                <LinkIcon aria-hidden="true" />
                {approving ? "Approving..." : "Approve connection"}
              </Button>
            </div>
          </div>
        )}
      </SectionCard>
    </PageContainer>
  );
}

function ConnectionDetail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <div className="mt-0.5 text-primary">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          {label}
        </p>
        <p className="break-words text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

async function loadManageableStores(
  accessToken: string,
  platformAccess: CurrentPlatformAccess,
): Promise<StoreOption[]> {
  const platformCanManage =
    platformAccess.isSuperadmin ||
    platformAccess.permissions.includes("INTEGRATIONS_MANAGE");
  if (platformCanManage) {
    const response = await listStores(accessToken, {
      pageSize: 100,
      status: "ACTIVE",
      sort: "nameAsc",
    });
    return response.data.map((store) => ({ id: store.id, name: store.name }));
  }
  const memberships = await listActiveOrganizations(accessToken);
  const access = await Promise.all(
    memberships.map(async (store) => ({
      store,
      permissions: await getEffectiveStorePermissions(accessToken, store.id),
    })),
  );
  return access
    .filter(
      ({ permissions }) =>
        permissions.platformBypass ||
        permissions.permissions.includes("integrations.manage"),
    )
    .map(({ store }) => ({ id: store.id, name: store.name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function messageFor(error: unknown): string {
  return error instanceof SafeApiError
    ? error.message
    : "The Shopify connection could not be loaded. Try again.";
}
