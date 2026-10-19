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
  Label,
  SelectMenu,
} from "@selfx/ui";
import type {
  PhonePeSetup,
  PhonePeEditDetails,
  PaymentEnvironment,
} from "@/lib/payments";

type PhonePeFormProps = {
  saveConfiguration: (input: PhonePeSetup) => Promise<void>;
  platformTest?: boolean;
  onCancel: () => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  initial?: PhonePeEditDetails;
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
        className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>
            {platformTest
              ? "PhonePe test setup"
              : initial
                ? "Edit PhonePe"
                : "Set up PhonePe"}
          </DialogTitle>
          <DialogDescription>
            {platformTest
              ? "Enter confirmed UAT credentials for platform testing only. These are never used by Store checkout."
              : "Enter this Store’s merchant details."}{" "}
            {initial
              ? "Leave Salt Key blank to keep the saved key. Changing account details resets verification."
              : "Enter all required account details. The Salt Key is never displayed again."}
          </DialogDescription>
        </DialogHeader>
        <PhonePeConfigurationForm
          saveConfiguration={saveConfiguration}
          platformTest={platformTest}
          onCancel={onClose}
          onBusyChange={setBusy}
          initial={initial}
        />
      </DialogContent>
    </Dialog>
  );
}

export function PhonePeConfigurationForm({
  saveConfiguration,
  platformTest = false,
  onCancel,
  onBusyChange,
  disabled = false,
  initial,
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
        ...(dqrAccessConfirmed && environment === "UAT"
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
      className="space-y-4"
      onSubmit={(event) => void save(event)}
      autoComplete="off"
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
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
            onChange={(value) => setEnvironment(value as PaymentEnvironment)}
          />
        </div>
        {environment === "UAT" && (
          <div className="min-w-0 space-y-2">
            <Label htmlFor="phonepe-access">Dynamic QR test access</Label>
            <SelectMenu
              id="phonepe-access"
              ariaLabel="Dynamic QR test access"
              value={dqrAccessConfirmed ? "CONFIRMED" : "UNCONFIRMED"}
              disabled={locked}
              options={[
                { value: "UNCONFIRMED", label: "Not confirmed yet" },
                {
                  value: "CONFIRMED",
                  label: "I confirm UAT Dynamic QR access is enabled",
                },
              ]}
              onChange={(value) => setDqrAccessConfirmed(value === "CONFIRMED")}
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
        <div
          className={
            platformTest
              ? "min-w-0 space-y-2 sm:col-span-2"
              : "min-w-0 space-y-2"
          }
        >
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
          <Input
            id="phonepe-key"
            type="password"
            autoComplete="new-password"
            required={!initial}
            minLength={16}
            maxLength={256}
            value={saltKey}
            disabled={locked}
            onChange={(event) => setSaltKey(event.target.value)}
            placeholder={
              initial ? "Leave blank to keep the saved key" : undefined
            }
          />
          {initial && (
            <p className="text-sm text-muted-foreground">
              A Salt Key is saved. It is never returned or displayed.
            </p>
          )}
        </div>
      </div>
      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background pt-4">
        <Button type="submit" disabled={locked}>
          {busy ? "Saving…" : initial ? "Save changes" : "Save configuration"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={locked}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
