"use client";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "@selfx/ui";
import {
  getCurrentMerchantStoreAccess,
  type CurrentStoreAccess,
} from "@/lib/current-store";
import { useSession } from "@/lib/session";
import { PaymentSettingsPage } from "@/components/payment-settings-page";

export default function StorePaymentsPage() {
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
    let active = true;
    setContext(null);
    setError(false);
    if (token)
      void getCurrentMerchantStoreAccess(token)
        .then((value) => {
          if (active) setContext(value);
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
        title="Payment settings unavailable"
        description="Unable to load your Store access. Reload to try again."
      />
    );
  if (!context) return <LoadingState label="Loading Store payment settings" />;
  if (!context.store || !context.permissions?.paymentAccess?.view)
    return (
      <ErrorState
        title="Store access required"
        description="An active Store membership with payment viewing permission is required."
      />
    );
  return (
    <PaymentSettingsPage
      key={context.store.id}
      storeId={context.store.id}
      merchantWorkspace
    />
  );
}
