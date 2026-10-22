"use client";
import { useState } from "react";
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
  SecretInput,
  Label,
  SelectMenu,
} from "@selfx/ui";
import type {
  PhonePeSetup,
  PhonePeEditDetails,
  PaymentEnvironment,
} from "@/lib/payments";
import { PaymentProviderLogo } from "./payment-provider-logo";

type PhonePeFormProps = {
  saveConfiguration: (input: PhonePeSetup) => Promise<void>;
  platformTest?: boolean;
  onCancel: () => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  initial?: PhonePeEditDetails;
  modal?: boolean;
};

export function PhonePeConfiguration({
  saveConfiguration,
  platformTest = false,
  onClose,
  initial,
}: {
  saveConfiguration: (input: PhonePeSetup) => Promise<void>;
  platformTest?: boolean;
  onClose: () => void;
  initial?: PhonePeEditDetails;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        showCloseButton={!busy}
      >
        <DialogHeader className="shrink-0 border-b p-6 pr-12">
          <div className="flex items-center gap-4">
            <PaymentProviderLogo provider="PHONEPE" />
            <div className="space-y-2">
              <DialogTitle>
                {platformTest
                  ? "PhonePe test setup"
                  : initial
                    ? "Edit PhonePe"
                    : "Set up PhonePe"}
              </DialogTitle>
              <DialogDescription>Dynamic UPI QR payments.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <PhonePeConfigurationForm
          saveConfiguration={saveConfiguration}
          platformTest={platformTest}
          onCancel={onClose}
          onBusyChange={setBusy}
          initial={initial}
          modal
        />
      </DialogContent>
    </Dialog>
  );
}

function AccountGuidance({
  platformTest,
  editing,
}: {
  platformTest: boolean;
  editing: boolean;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      {platformTest
        ? "Enter confirmed UAT credentials for platform testing only. These are never used by Store checkout."
        : "Enter this Store’s merchant details."}{" "}
      {editing
        ? "Secret saved. Enter a new value to replace it. Changing account details resets verification."
        : "Enter all required account details. The Salt Key is never displayed again."}
    </p>
  );
}

export function PhonePeConfigurationForm({
  saveConfiguration,
  platformTest = false,
  onCancel,
  onBusyChange,
  disabled = false,
  initial,
  modal = false,
}: PhonePeFormProps) {
  const [dqrAccessConfirmed, setDqrAccessConfirmed] = useState(
    initial?.dqrAccessConfirmed ?? false,
  );
  const [environment, setEnvironment] = useState<PaymentEnvironment>(
    initial?.environment ?? (platformTest ? "UAT" : "UNCONFIRMED"),
  );
  const [merchantId, setMerchantId] = useState(initial?.merchantId ?? ""),
    [providerId, setProviderId] = useState(initial?.providerId ?? "");
  const [providerStoreId, setProviderStoreId] = useState(
      initial?.providerStoreId ?? "",
    ),
    [saltIndex, setSaltIndex] = useState(initial?.saltIndex ?? ""),
    [saltKey, setSaltKey] = useState("");
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const locked = busy || disabled;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (locked) return;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      await saveConfiguration({
        environment,
        merchantId: merchantId.trim(),
        saltIndex: saltIndex.trim(),
        saltKey,
        ...(dqrAccessConfirmed && ["UAT", "PRODUCTION"].includes(environment)
          ? { dqrAccessConfirmed: true }
          : {}),
        ...(providerId.trim() ? { providerId: providerId.trim() } : {}),
        ...(providerStoreId.trim()
          ? { providerStoreId: providerStoreId.trim() }
          : {}),
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Payment configuration could not be saved.",
      );
    } finally {
      setSaltKey("");
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <form
      className={
        modal ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "space-y-4"
      }
      onSubmit={(event) => void save(event)}
      autoComplete="off"
    >
      <div className={modal ? "min-h-0 overflow-y-auto p-4 sm:p-6" : undefined}>
        <div className="space-y-6 rounded-xl border p-4 sm:p-5">
          <div className="space-y-2">
            <h3 className="font-semibold">Account details</h3>
            <AccountGuidance platformTest={platformTest} editing={!!initial} />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-5 [&_input]:h-11">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="phonepe-environment">Account environment</Label>
              <SelectMenu
                id="phonepe-environment"
                ariaLabel="Account environment"
                value={environment}
                disabled={locked}
                options={
                  platformTest
                    ? [{ value: "UAT", label: "UAT / test only" }]
                    : [
                        { value: "UNCONFIRMED", label: "Not confirmed yet" },
                        { value: "UAT", label: "UAT / test" },
                        { value: "PRODUCTION", label: "Production / live" },
                      ]
                }
                onChange={(value) =>
                  setEnvironment(value as PaymentEnvironment)
                }
              />
            </div>
            {["UAT", "PRODUCTION"].includes(environment) && (
              <div className="min-w-0 space-y-2">
                <Label htmlFor="phonepe-access">
                  Dynamic QR account access
                </Label>
                <SelectMenu
                  id="phonepe-access"
                  ariaLabel="Dynamic QR account access"
                  value={dqrAccessConfirmed ? "CONFIRMED" : "UNCONFIRMED"}
                  disabled={locked}
                  options={[
                    { value: "UNCONFIRMED", label: "Not confirmed yet" },
                    {
                      value: "CONFIRMED",
                      label:
                        "I confirm Dynamic QR access is enabled for this account",
                    },
                  ]}
                  onChange={(value) =>
                    setDqrAccessConfirmed(value === "CONFIRMED")
                  }
                />
              </div>
            )}
            <div className="min-w-0 space-y-2">
              <Label htmlFor="phonepe-merchant">Merchant ID</Label>
              <Input
                id="phonepe-merchant"
                required
                maxLength={100}
                pattern={"[A-Za-z0-9_\\-]+"}
                value={merchantId}
                disabled={locked}
                onChange={(event) => setMerchantId(event.target.value)}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="phonepe-provider">Provider ID (optional)</Label>
              <Input
                id="phonepe-provider"
                maxLength={100}
                pattern={"[A-Za-z0-9_\\-]+"}
                value={providerId}
                disabled={locked}
                onChange={(event) => setProviderId(event.target.value)}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="phonepe-store">
                PhonePe Store reference (optional)
              </Label>
              <Input
                id="phonepe-store"
                maxLength={37}
                pattern={"[A-Za-z0-9_\\-]+"}
                value={providerStoreId}
                disabled={locked}
                onChange={(event) => setProviderStoreId(event.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                {platformTest
                  ? "Leave blank to use the platform test reference."
                  : "Leave blank to generate a stable reference for this Store."}{" "}
                Use the assigned reference if PhonePe supplied one.
              </p>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="phonepe-index">Salt Index</Label>
              <Input
                id="phonepe-index"
                required
                maxLength={10}
                pattern="[0-9]+"
                inputMode="numeric"
                value={saltIndex}
                disabled={locked}
                onChange={(event) => setSaltIndex(event.target.value)}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="phonepe-key">Salt Key</Label>
              <SecretInput
                id="phonepe-key"
                saved={!!initial}
                aria-describedby={initial ? "phonepe-key-hint" : undefined}
                autoComplete="new-password"
                required={!initial}
                minLength={16}
                maxLength={256}
                value={saltKey}
                disabled={locked}
                onChange={(event) => setSaltKey(event.target.value)}
              />
              {initial && (
                <p
                  id="phonepe-key-hint"
                  className="text-sm text-muted-foreground"
                >
                  Key saved. Enter a new key to replace it.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      <div
        className={
          modal
            ? "flex shrink-0 flex-wrap justify-end gap-2 border-t bg-background p-4 sm:px-6"
            : "flex flex-wrap justify-end gap-2 border-t pt-4"
        }
      >
        <Button
          type="button"
          variant="outline"
          disabled={locked}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={locked}>
          {busy
            ? "Saving…"
            : platformTest
              ? "Save configuration"
              : "Save gateway"}
        </Button>
      </div>
    </form>
  );
}
