"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  PageContainer,
  PageHeader,
} from "@selfx/ui";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import {
  getCurrentStoreImpersonation,
  getEffectiveStorePermissions,
} from "@/lib/stores";
import { useSession } from "@/lib/session";
import { PaymentSettings } from "./payment-settings";

export function PaymentSettingsPage({ storeId }: { storeId?: string }) {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [access, setAccess] = useState<{ view: boolean; edit: boolean } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    setAccess(null);
    setError(null);
    if (accessToken)
      void Promise.all([
        getCurrentPlatformAccess(accessToken),
        storeId
          ? getEffectiveStorePermissions(accessToken, storeId)
          : Promise.resolve(null),
        getCurrentStoreImpersonation(accessToken).catch(() => ({
          session: null,
        })),
      ])
        .then(([platform, store, impersonation]) => {
          if (!current) return;
          const bypass = platform.isSuperadmin || !!store?.platformBypass;
          setAccess({
            view:
              (bypass ||
                platform.permissions.includes("INTEGRATIONS_VIEW") ||
                !!store?.permissions.includes("integrations.view")) &&
              (!!storeId || !impersonation.session),
            edit:
              !impersonation.session &&
              (bypass ||
                platform.permissions.includes("INTEGRATIONS_MANAGE") ||
                !!store?.permissions.includes("integrations.manage")),
          });
        })
        .catch((caught) => {
          if (current)
            setError(
              caught instanceof Error
                ? caught.message
                : "Could not check payment settings access.",
            );
        });
    return () => {
      current = false;
    };
  }, [accessToken, storeId, reload]);
  return (
    <PageContainer width="wide">
      <PageHeader
        title={storeId ? "Store Payments" : "Payment Gateways"}
        description={
          storeId
            ? "Configure the Store's merchant payment account."
            : "Manage gateway availability across SelfX Stores."
        }
        actions={
          storeId ? (
            <Button
              variant="outline"
              render={<Link href={`/app/stores/${storeId}`} />}
            >
              Back to Store
            </Button>
          ) : undefined
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
          <Button
            variant="outline"
            onClick={() => setReload((value) => value + 1)}
          >
            Retry
          </Button>
        </Alert>
      )}
      {!access && !error && <p>Checking payment settings access…</p>}
      {access && !access.view && (
        <p>You do not have permission to view payment settings.</p>
      )}
      {access?.view && accessToken && (
        <PaymentSettings
          key={storeId ?? "platform"}
          accessToken={accessToken}
          storeId={storeId}
          canEdit={access.edit}
        />
      )}
    </PageContainer>
  );
}
