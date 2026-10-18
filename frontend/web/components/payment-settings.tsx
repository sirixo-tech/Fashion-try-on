"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  PageSection,
  SectionCard,
} from "@selfx/ui";
import { PlatformPaymentGateways } from "./platform-payment-gateways";
import { PhonePeConfiguration } from "./phonepe-configuration";
import { StorePaymentVerification } from "./store-payment-verification";
import {
  getStorePayments,
  savePhonePeSetup,
  selectStoreGateway,
  type Gateway,
  type PaymentEnvironment,
  type PaymentProvider,
  type StorePaymentSettings,
} from "@/lib/payments";

export function PaymentSettings(props: {
  accessToken: string;
  storeId?: string;
  canEdit: boolean;
}) {
  return props.storeId ? (
    <StorePaymentSettingsPanel {...props} storeId={props.storeId} />
  ) : (
    <PlatformPaymentGateways
      accessToken={props.accessToken}
      canEdit={props.canEdit}
    />
  );
}
function StorePaymentSettingsPanel({
  accessToken,
  storeId,
  canEdit,
}: {
  accessToken: string;
  storeId: string;
  canEdit: boolean;
}) {
  const [gateways, setGateways] = useState<Gateway[] | null>(null);
  const [store, setStore] = useState<StorePaymentSettings | null>(null);
  const [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0),
    [setup, setSetup] = useState(false);
  useEffect(() => {
    let current = true;
    setGateways(null);
    setStore(null);
    setError(null);
    setNotice(null);
    void getStorePayments(accessToken, storeId)
      .then((result) => {
        if (!current) return;
        setStore(result);
        setGateways(result.gateways);
      })
      .catch((caught) => {
        if (current) setError(message(caught));
      });
    return () => {
      current = false;
    };
  }, [accessToken, storeId, reload]);
  async function change(provider: PaymentProvider | null) {
    if (!canEdit || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (store) {
        setStore(
          await selectStoreGateway(
            accessToken,
            storeId,
            store.version,
            provider ?? null,
          ),
        );
        setNotice(
          provider
            ? "Gateway selected. Account verification is still required before payments are available."
            : "Gateway selection cleared.",
        );
      }
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <PageSection>
      <Alert>
        <AlertDescription>
          Choose the Store's payment gateway and configure its merchant account.
          Payment collection is not available until setup has been verified.
        </AlertDescription>
      </Alert>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && <p role="status">{notice}</p>}
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => setReload((value) => value + 1)}
      >
        Refresh gateways
      </Button>
      {!gateways && !error && <p>Loading payment gateways…</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {gateways?.map((gateway) => {
          const connection = store?.connections.find(
            (item) => item.provider === gateway.provider,
          );
          const selected = store?.selectedProvider === gateway.provider;
          return (
            <SectionCard
              key={gateway.provider}
              title={gateway.name}
              description={
                gateway.setupAvailable ? "Store merchant account" : "Planned"
              }
            >
              <div className="space-y-3">
                <p>
                  {gateway.enabled
                    ? "Available for Store selection"
                    : "Unavailable for selection"}
                </p>
                <>
                  <p>
                    {connection
                      ? `Configuration saved · ${environmentLabel(connection.environment)}`
                      : "Not configured"}
                  </p>
                  {connection?.dqrAccessConfirmed && (
                    <p>
                      UAT Dynamic QR access declared by the Store. Live payments
                      remain unavailable.
                    </p>
                  )}
                  {selected && (
                    <p>
                      Selected for future checkout
                      {!gateway.enabled ? " · Disabled by SelfX" : ""}
                    </p>
                  )}
                  {canEdit && gateway.setupAvailable && (
                    <Button
                      variant="outline"
                      disabled={busy || !gateway.enabled}
                      onClick={() => setSetup(true)}
                    >
                      {connection
                        ? "Replace configuration"
                        : "Configure PhonePe"}
                    </Button>
                  )}
                  {canEdit && connection && (
                    <Button
                      disabled={busy || (!selected && !gateway.enabled)}
                      variant={selected ? "outline" : "default"}
                      onClick={() =>
                        void change(selected ? null : gateway.provider)
                      }
                    >
                      {selected ? "Clear selection" : "Select gateway"}
                    </Button>
                  )}
                </>
              </div>
            </SectionCard>
          );
        })}
      </div>
      {store && (
        <StorePaymentVerification
          key={`${storeId}:${store.connections.find((item) => item.provider === "PHONEPE")?.version ?? 0}`}
          accessToken={accessToken}
          storeId={storeId}
          canEdit={canEdit}
          enabled={
            !!gateways?.find((item) => item.provider === "PHONEPE")?.enabled
          }
          disabled={busy || setup}
        />
      )}
      {setup && storeId && store && (
        <PhonePeConfiguration
          onClose={() => setSetup(false)}
          saveConfiguration={async (input) => {
            const result = await savePhonePeSetup(
              accessToken,
              storeId,
              store.version,
              input,
            );
            setStore(result);
            setSetup(false);
            setNotice(
              "PhonePe configuration saved securely. Verification is still pending.",
            );
          }}
        />
      )}
    </PageSection>
  );
}
function environmentLabel(environment: PaymentEnvironment) {
  return {
    UNCONFIRMED: "Environment unconfirmed",
    UAT: "Test account",
    PRODUCTION: "Live account",
  }[environment];
}
function message(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : "Payment settings could not be loaded or saved.";
}
