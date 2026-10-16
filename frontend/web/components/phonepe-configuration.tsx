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
import type { PhonePeSetup, PaymentEnvironment } from "@/lib/payments";

type PhonePeFormProps = {
  saveConfiguration: (input: PhonePeSetup) => Promise<void>;
  platformTest?: boolean;
  onCancel: () => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
};

export function PhonePeConfiguration({
  saveConfiguration,
  platformTest = false,
  onClose,
}: {
  saveConfiguration: (input: PhonePeSetup) => Promise<void>;
  platformTest?: boolean;
  onClose: () => void;
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
        className="max-h-[90dvh] overflow-y-auto"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>
            {platformTest ? "PhonePe test setup" : "Configure PhonePe"}
          </DialogTitle>
          <DialogDescription>
            {platformTest
              ? "Enter confirmed UAT credentials for platform testing only. These are never used by Store checkout."
              : "Enter this Store’s merchant details."}{" "}
            Saving replaces the full configuration. The Salt Key is never
            displayed again.
          </DialogDescription>
        </DialogHeader>
        <PhonePeConfigurationForm
          saveConfiguration={saveConfiguration}
          platformTest={platformTest}
          onCancel={onClose}
          onBusyChange={setBusy}
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
}: PhonePeFormProps) {
  const [dqrAccessConfirmed, setDqrAccessConfirmed] = useState(false);
  const [environment, setEnvironment] = useState<PaymentEnvironment>(
    platformTest ? "UAT" : "UNCONFIRMED",
  );
  const [merchantId, setMerchantId] = useState(""),
    [providerId, setProviderId] = useState("");
  const [providerStoreId, setProviderStoreId] = useState(""),
    [saltIndex, setSaltIndex] = useState(""),
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
      <div
        className={platformTest ? "grid gap-4 sm:grid-cols-2" : "grid gap-3"}
      >
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
            required
            minLength={16}
            maxLength={256}
            value={saltKey}
            disabled={locked}
            onChange={(event) => setSaltKey(event.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={locked}>
          {busy ? "Saving…" : "Save configuration"}
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
