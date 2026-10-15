"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PageSection,
  SectionCard,
  SelectMenu,
} from "@selfx/ui";
import {
  getStorePayments,
  listPaymentGateways,
  savePhonePeSetup,
  selectStoreGateway,
  updatePaymentGateway,
  type Gateway,
  type PaymentEnvironment,
  type PaymentProvider,
  type StorePaymentSettings,
} from "@/lib/payments";

export function PaymentSettings({
  accessToken,
  storeId,
  canEdit,
}: {
  accessToken: string;
  storeId?: string;
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
    void (
      storeId
        ? getStorePayments(accessToken, storeId)
        : listPaymentGateways(accessToken)
    )
      .then((result) => {
        if (!current) return;
        if ("gateways" in result) {
          setStore(result);
          setGateways(result.gateways);
        } else setGateways(result.data);
      })
      .catch((caught) => {
        if (current) setError(message(caught));
      });
    return () => {
      current = false;
    };
  }, [accessToken, storeId, reload]);
  async function change(gateway: Gateway, provider?: PaymentProvider | null) {
    if (!canEdit || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (storeId && store) {
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
      } else {
        setGateways(
          (await updatePaymentGateway(accessToken, gateway, !gateway.enabled))
            .data,
        );
        setNotice("Gateway configuration availability updated.");
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
          {storeId
            ? "Choose the Store's payment gateway and configure its merchant account. Payment collection is not available until setup has been verified."
            : "Control which gateways Stores can configure. Making a gateway available does not enable payment collection."}
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
                {storeId ? (
                  <>
                    <p>
                      {connection
                        ? `Configuration saved · ${environmentLabel(connection.environment)} · Verification pending`
                        : "Not configured"}
                    </p>
                    {connection?.dqrAccessConfirmed && (
                      <p>
                        UAT Dynamic QR access declared by the Store. Live
                        payments remain unavailable.
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
                          void change(
                            gateway,
                            selected ? null : gateway.provider,
                          )
                        }
                      >
                        {selected ? "Clear selection" : "Select gateway"}
                      </Button>
                    )}
                  </>
                ) : (
                  canEdit && (
                    <Button
                      disabled={busy || !gateway.setupAvailable}
                      variant="outline"
                      onClick={() => void change(gateway)}
                    >
                      {gateway.enabled
                        ? "Make unavailable"
                        : "Make available to Stores"}
                    </Button>
                  )
                )}
              </div>
            </SectionCard>
          );
        })}
      </div>
      {setup && storeId && store && (
        <PhonePeConfiguration
          accessToken={accessToken}
          storeId={storeId}
          version={store.version}
          onClose={() => setSetup(false)}
          onSaved={(result) => {
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
function PhonePeConfiguration({
  accessToken,
  storeId,
  version,
  onClose,
  onSaved,
}: {
  accessToken: string;
  storeId: string;
  version: number;
  onClose: () => void;
  onSaved: (result: StorePaymentSettings) => void;
}) {
  const [dqrAccessConfirmed, setDqrAccessConfirmed] = useState(false);
  const [environment, setEnvironment] =
    useState<PaymentEnvironment>("UNCONFIRMED");
  const [merchantId, setMerchantId] = useState(""),
    [providerId, setProviderId] = useState("");
  const [providerStoreId, setProviderStoreId] = useState(""),
    [saltIndex, setSaltIndex] = useState(""),
    [saltKey, setSaltKey] = useState("");
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await savePhonePeSetup(accessToken, storeId, version, {
          environment,
          merchantId: merchantId.trim(),
          saltIndex: saltIndex.trim(),
          saltKey,
          ...(dqrAccessConfirmed && environment === "UAT"
            ? { dqrAccessConfirmed: true }
            : {}),
          ...(providerId.trim() ? { providerId: providerId.trim() } : {}),
          ...(providerStoreId.trim()
            ? { providerStoreId: providerStoreId.trim() }
            : {}),
        }),
      );
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSaltKey("");
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>Configure PhonePe</DialogTitle>
          <DialogDescription>
            Enter this Store's merchant details. Saving replaces the full
            configuration. The Salt Key is never displayed again.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form
          className="space-y-3"
          onSubmit={(event) => void save(event)}
          autoComplete="off"
        >
          <Label htmlFor="phonepe-environment">Account environment</Label>
          <SelectMenu
            id="phonepe-environment"
            ariaLabel="Account environment"
            value={environment}
            disabled={busy}
            options={[
              { value: "UNCONFIRMED", label: "Not confirmed yet" },
              { value: "UAT", label: "UAT / test" },
              { value: "PRODUCTION", label: "Production / live" },
            ]}
            onChange={(value) => setEnvironment(value as PaymentEnvironment)}
          />
          <Label htmlFor="phonepe-merchant">Merchant ID</Label>
          {environment === "UAT" && (
            <div className="space-y-2">
              <Label htmlFor="phonepe-access">Dynamic QR test access</Label>
              <SelectMenu
                id="phonepe-access"
                ariaLabel="Dynamic QR test access"
                value={dqrAccessConfirmed ? "CONFIRMED" : "UNCONFIRMED"}
                disabled={busy}
                options={[
                  { value: "UNCONFIRMED", label: "Not confirmed yet" },
                  {
                    value: "CONFIRMED",
                    label: "I confirm UAT Dynamic QR access is enabled",
                  },
                ]}
                onChange={(value) =>
                  setDqrAccessConfirmed(value === "CONFIRMED")
                }
              />
            </div>
          )}
          <Input
            id="phonepe-merchant"
            required
            maxLength={100}
            pattern={"[A-Za-z0-9_\\-]+"}
            value={merchantId}
            disabled={busy}
            onChange={(event) => setMerchantId(event.target.value)}
          />
          <Label htmlFor="phonepe-provider">Provider ID (optional)</Label>
          <Input
            id="phonepe-provider"
            maxLength={100}
            pattern={"[A-Za-z0-9_\\-]+"}
            value={providerId}
            disabled={busy}
            onChange={(event) => setProviderId(event.target.value)}
          />
          <Label htmlFor="phonepe-store">
            PhonePe Store reference (optional)
          </Label>
          <Input
            id="phonepe-store"
            maxLength={37}
            pattern={"[A-Za-z0-9_\\-]+"}
            value={providerStoreId}
            disabled={busy}
            onChange={(event) => setProviderStoreId(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Leave blank to generate a stable reference for this Store. Use the
            assigned reference if PhonePe supplied one.
          </p>
          <Label htmlFor="phonepe-index">Salt Index</Label>
          <Input
            id="phonepe-index"
            required
            maxLength={10}
            pattern="[0-9]+"
            inputMode="numeric"
            value={saltIndex}
            disabled={busy}
            onChange={(event) => setSaltIndex(event.target.value)}
          />
          <Label htmlFor="phonepe-key">Salt Key</Label>
          <Input
            id="phonepe-key"
            type="password"
            autoComplete="new-password"
            required
            minLength={16}
            maxLength={256}
            value={saltKey}
            disabled={busy}
            onChange={(event) => setSaltKey(event.target.value)}
          />
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save configuration"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
        </form>
      </DialogContent>
    </Dialog>
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
