"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CreditCardIcon,
  PencilIcon,
  RefreshCwIcon,
  Settings2Icon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  PageSection,
  StatCard,
  Switch,
} from "@selfx/ui";
import { PlatformPaymentGateways } from "./platform-payment-gateways";
import { PhonePeConfiguration } from "./phonepe-configuration";
import { PaymentProviderLogo } from "./payment-provider-logo";
import { StorePaymentVerification } from "./store-payment-verification";
import {
  getStorePayments,
  getPhonePeEdit,
  savePhonePeSetup,
  editPhonePeSetup,
  deletePhonePeSetup,
  selectStoreGateway,
  type PaymentProvider,
  type StorePaymentSettings,
  type PhonePeEditDetails,
} from "@/lib/payments";

export function PaymentSettings(props: {
  accessToken: string;
  storeId?: string;
  canEdit: boolean;
}) {
  return props.storeId ? (
    <StorePaymentSettingsPanel
      key={props.storeId}
      {...props}
      storeId={props.storeId}
    />
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
  const [store, setStore] = useState<StorePaymentSettings | null>(null);
  const [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const [setup, setSetup] = useState(false),
    [initial, setInitial] = useState<PhonePeEditDetails | undefined>();
  const [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const formVersion = useRef(0),
    deleteVersion = useRef(0);
  const locked = busy || setup || deleting;
  const refreshVerified = useCallback(() => {
    void getStorePayments(accessToken, storeId)
      .then(setStore)
      .catch((caught) => setError(message(caught)));
  }, [accessToken, storeId]);
  useEffect(() => {
    let current = true;
    setError(null);
    void getStorePayments(accessToken, storeId)
      .then((value) => {
        if (current) setStore(value);
      })
      .catch((caught) => {
        if (current) setError(message(caught));
      });
    return () => {
      current = false;
    };
  }, [accessToken, storeId, reload]);
  async function change(provider: PaymentProvider | null) {
    if (!canEdit || locked || inFlight.current || !store) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setStore(
        await selectStoreGateway(accessToken, storeId, store.version, provider),
      );
      setNotice(
        provider
          ? "Gateway turned on for future checkout. Customer checkout remains unavailable."
          : "Gateway turned off. Your saved configuration has been kept.",
      );
    } catch (caught) {
      setError(message(caught));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function edit() {
    if (!canEdit || locked || inFlight.current || !store) return;
    formVersion.current = store.version;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      setInitial(await getPhonePeEdit(accessToken, storeId));
      setSetup(true);
    } catch (caught) {
      setError(message(caught));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (!canEdit || busy || inFlight.current || !store) return;
    inFlight.current = true;
    setBusy(true);
    setDeleteError(null);
    try {
      setStore(
        await deletePhonePeSetup(accessToken, storeId, deleteVersion.current),
      );
      setDeleting(false);
      setNotice(
        "PhonePe configuration deleted. Payment history and pending verification are retained.",
      );
    } catch (caught) {
      setDeleteError(message(caught));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const configured = store?.connections.length ?? 0;
  const verifiedLive =
    store?.connections.filter(
      (item) => item.environment === "PRODUCTION" && item.status === "VERIFIED",
    ).length ?? 0;
  const phonePe = store?.connections.find(
    (item) => item.provider === "PHONEPE",
  );
  return (
    <PageSection>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">
          Set up and verify your Store's payment accounts. Customer checkout is
          not enabled yet.
        </p>
        <Button
          variant="outline"
          disabled={locked}
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCwIcon aria-hidden="true" />
          Refresh gateways
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && <p role="status">{notice}</p>}
      {!store && !error && <p>Loading payment gateways…</p>}
      {store && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Configured"
            value={String(configured)}
            icon={<Settings2Icon />}
          />
          <StatCard
            label="Turned on"
            value={store.selectedProvider ? "1" : "0"}
            secondaryValue="Selected for future checkout"
            icon={<CreditCardIcon />}
          />
          <StatCard
            label="Live accounts verified"
            value={String(verifiedLive)}
            icon={<ShieldCheckIcon />}
          />
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {store?.gateways.map((gateway) => {
          const connection = store.connections.find(
            (item) => item.provider === gateway.provider,
          );
          const selected = store.selectedProvider === gateway.provider;
          const status = !gateway.setupAvailable
            ? "Planned"
            : !connection
              ? "Needs setup"
              : !gateway.enabled || !selected
                ? "Off"
                : connection.status === "VERIFIED"
                  ? "Verified"
                  : "Needs verification";
          return (
            <Card
              key={gateway.provider}
              className={
                selected ? "border-primary ring-1 ring-primary/20" : undefined
              }
            >
              <CardHeader>
                <div className="flex items-center gap-3 sm:gap-4">
                  <PaymentProviderLogo
                    provider={gateway.provider}
                    className="w-24 sm:w-32"
                  />
                  <div className="min-w-0 space-y-2">
                    <CardTitle>{gateway.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {gateway.provider === "PHONEPE" ||
                      gateway.provider === "PAYTM"
                        ? "Dynamic UPI QR payments."
                        : gateway.provider === "STRIPE"
                          ? "Cards and international payments."
                          : gateway.provider === "RAZORPAY"
                            ? "Payments for India."
                            : "Payments with PayPal."}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {gateway.setupAvailable && connection && (
                        <Badge
                          variant="outline"
                          className="border-info/20 bg-info/10 text-info text-[11px]"
                        >
                          {connection.environment === "PRODUCTION"
                            ? "Live mode"
                            : connection.environment === "UAT"
                              ? "Test mode"
                              : "Mode unconfirmed"}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={
                          status === "Verified"
                            ? "border-success/20 bg-success/10 text-success text-[11px]"
                            : status === "Needs verification" ||
                                status === "Needs setup"
                              ? "border-warning/30 bg-warning/10 text-foreground text-[11px]"
                              : "border-border bg-muted/50 text-muted-foreground text-[11px]"
                        }
                        title={
                          status === "Verified"
                            ? "Account verification passed. Customer checkout is not enabled yet."
                            : undefined
                        }
                      >
                        {status}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              {gateway.setupAvailable && (
                <CardContent className="space-y-4">
                  {!gateway.enabled && gateway.setupAvailable && (
                    <p className="text-sm text-muted-foreground">
                      New setup and selection are disabled by SelfX.
                    </p>
                  )}
                  {gateway.setupAvailable && (
                    <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4">
                      <div>
                        <p className="font-medium">Use for future checkout</p>
                        <p className="text-sm text-muted-foreground">
                          {selected ? "On" : "Off"} · Saved automatically
                        </p>
                      </div>
                      <Switch
                        aria-label={`Use ${gateway.name} for future checkout`}
                        checked={selected}
                        disabled={
                          !canEdit ||
                          locked ||
                          !connection ||
                          (!selected && !gateway.enabled)
                        }
                        onCheckedChange={(on) =>
                          void change(on ? gateway.provider : null)
                        }
                      />
                    </div>
                  )}
                </CardContent>
              )}
              {canEdit && gateway.setupAvailable && (
                <CardFooter className="flex flex-wrap gap-2">
                  {canEdit && gateway.setupAvailable && !connection && (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={locked || !gateway.enabled}
                      onClick={() => {
                        formVersion.current = store.version;
                        setInitial(undefined);
                        setSetup(true);
                      }}
                    >
                      <Settings2Icon aria-hidden="true" />
                      Set up
                    </Button>
                  )}
                  {canEdit && gateway.setupAvailable && connection && (
                    <>
                      <Button
                        variant="outline"
                        disabled={locked || !gateway.enabled}
                        onClick={() => void edit()}
                      >
                        <PencilIcon aria-hidden="true" />
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={locked}
                        onClick={() => {
                          deleteVersion.current = store.version;
                          setDeleteError(null);
                          setDeleting(true);
                        }}
                      >
                        <Trash2Icon aria-hidden="true" />
                        Delete
                      </Button>
                    </>
                  )}
                </CardFooter>
              )}
            </Card>
          );
        })}
      </div>
      {store && (
        <div id="phonepe-verification" className="scroll-mt-4">
          <StorePaymentVerification
            key={`${storeId}:${phonePe?.version ?? 0}`}
            accessToken={accessToken}
            storeId={storeId}
            canEdit={canEdit}
            enabled={
              !!store.gateways.find((item) => item.provider === "PHONEPE")
                ?.enabled
            }
            disabled={locked}
            onVerified={refreshVerified}
          />
        </div>
      )}
      {setup && store && (
        <PhonePeConfiguration
          initial={initial}
          onClose={() => {
            setSetup(false);
            setInitial(undefined);
          }}
          saveConfiguration={async (input) => {
            const result = initial
              ? await editPhonePeSetup(
                  accessToken,
                  storeId,
                  formVersion.current,
                  input,
                )
              : await savePhonePeSetup(
                  accessToken,
                  storeId,
                  formVersion.current,
                  input,
                );
            const unchanged =
              initial &&
              result.connections.find((item) => item.provider === "PHONEPE")
                ?.version === initial.version;
            setStore(result);
            setSetup(false);
            setInitial(undefined);
            setNotice(
              unchanged
                ? "No account changes. Existing verification was kept."
                : "PhonePe account saved securely. Verify the updated configuration before use.",
            );
          }}
        />
      )}
      {deleting && (
        <Dialog
          open
          onOpenChange={(value) => {
            if (!value && !busy) setDeleting(false);
          }}
        >
          <DialogContent showCloseButton={!busy}>
            <DialogHeader>
              <DialogTitle>Delete PhonePe configuration?</DialogTitle>
              <DialogDescription>
                This removes the saved gateway account and turns it off. Payment
                history and snapshots needed to verify pending payments will be
                retained. You can set up a new account later.
              </DialogDescription>
            </DialogHeader>
            {deleteError && (
              <Alert variant="destructive">
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setDeleting(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void remove()}
              >
                {busy ? "Deleting…" : "Delete configuration"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </PageSection>
  );
}
function message(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : "Payment settings could not be loaded or saved.";
}
