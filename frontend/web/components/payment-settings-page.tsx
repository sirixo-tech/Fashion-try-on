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
import { getCurrentMerchantStoreAccess } from "@/lib/current-store";
import { getEffectiveStorePermissions } from "@/lib/stores";
import { useSession } from "@/lib/session";
import { PaymentSettings } from "./payment-settings";

export function PaymentSettingsPage({
  storeId,
  merchantWorkspace = false,
}: {
  storeId?: string;
  merchantWorkspace?: boolean;
}) {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [access, setAccess] = useState<{ view: boolean; edit: boolean } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const refresh = () => {
      setAccess(null);
      setReload((value) => value + 1);
    };
    window.addEventListener("selfx:impersonation-changed", refresh);
    return () =>
      window.removeEventListener("selfx:impersonation-changed", refresh);
  }, []);
  useEffect(() => {
    let current = true;
    setAccess(null);
    setError(null);
    if (accessToken)
      void Promise.all([
        storeId ? Promise.resolve(null) : getCurrentPlatformAccess(accessToken),
        storeId
          ? getEffectiveStorePermissions(accessToken, storeId)
          : Promise.resolve(null),
        getCurrentMerchantStoreAccess(accessToken),
      ])
        .then(([platform, store, context]) => {
          if (!current) return;
          setAccess({
            view: storeId
              ? store?.paymentAccess?.view === true
              : !context.impersonation &&
                !!(
                  platform?.isSuperadmin ||
                  platform?.permissions.includes("INTEGRATIONS_VIEW")
                ),
            edit:
              !context.impersonation &&
              (storeId
                ? store?.paymentAccess?.manage === true
                : !!(
                    platform?.isSuperadmin ||
                    platform?.permissions.includes("INTEGRATIONS_MANAGE")
                  )),
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
        title={storeId ? "Payment Settings" : "Payment Gateways"}
        description={
          storeId
            ? "Configure the Store's merchant payment account."
            : "Manage gateway availability across SelfX Stores."
        }
        actions={
          storeId ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  href={
                    merchantWorkspace
                      ? "/app/dashboard"
                      : `/app/stores/${storeId}`
                  }
                />
              }
            >
              {merchantWorkspace ? "Back to Dashboard" : "Back to Store"}
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
