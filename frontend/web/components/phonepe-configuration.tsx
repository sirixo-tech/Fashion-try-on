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
export function PhonePeConfiguration({
  saveConfiguration,
  platformTest = false,
  onClose,
}: {
  saveConfiguration: (input: PhonePeSetup) => Promise<void>;
  platformTest?: boolean;
  onClose: () => void;
}) {
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
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
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
          <Label htmlFor="phonepe-merchant">Merchant ID</Label>
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
            {platformTest
              ? "Leave blank to use the platform test reference."
              : "Leave blank to generate a stable reference for this Store."}{" "}
            Use the assigned reference if PhonePe supplied one.
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
function message(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : "Payment configuration could not be saved.";
}
