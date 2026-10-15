"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  PageContainer,
  PageHeader,
} from "@selfx/ui";
import { StoreShopping } from "@/components/store-shopping";
import { useSession } from "@/lib/session";
import { getEffectiveStorePermissions } from "@/lib/stores";

export default function StoreShoppingPage() {
  const { storeId } = useParams<{ storeId: string }>();
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
      void getEffectiveStorePermissions(accessToken, storeId)
        .then((result) => {
          if (current)
            setAccess({
              view:
                result.platformBypass ||
                result.permissions.includes("stores.view"),
              edit:
                result.platformBypass ||
                result.permissions.includes("stores.update"),
            });
        })
        .catch((caught) => {
          if (current)
            setError(
              caught instanceof Error
                ? caught.message
                : "Could not check Store access.",
            );
        });
    return () => {
      current = false;
    };
  }, [accessToken, storeId, reload]);
  return (
    <PageContainer width="wide">
      <PageHeader
        title="Orders & Tax"
        description="Store shopping settings and order history."
        actions={
          <Button
            variant="outline"
            render={<Link href={`/app/stores/${storeId}`} />}
          >
            Back to Store
          </Button>
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            Retry
          </Button>
        </Alert>
      )}
      {!access && !error && <p>Checking Store access…</p>}
      {access && !access.view && (
        <p>You do not have permission to view Store orders.</p>
      )}
      {access?.view && accessToken && (
        <StoreShopping
          key={storeId}
          accessToken={accessToken}
          storeId={storeId}
          canEdit={access.edit}
        />
      )}
    </PageContainer>
  );
}
