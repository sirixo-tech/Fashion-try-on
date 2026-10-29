"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SelectMenu,
} from "@selfx/ui";
import {
  getCustomCreditPlan,
  saveCustomCreditPlan,
  type CustomCreditChannel,
  type CustomCreditPlan,
} from "@/lib/custom-credit-plans";

export function CustomCreditPlanCard({
  channel,
  accessToken,
  canManage,
}: {
  channel: CustomCreditChannel;
  accessToken: string;
  canManage: boolean;
}) {
  const [plan, setPlan] = useState<CustomCreditPlan | null>(null);
  const [name, setName] = useState(
    channel === "STORE" ? "Store custom credits" : "Mobile custom credits",
  );
  const [currency, setCurrency] = useState("INR");
  const [unitPrice, setUnitPrice] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("INACTIVE");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getCustomCreditPlan(accessToken, channel);
      setPlan(next);
      if (next) {
        setName(next.name);
        setCurrency(next.currency);
        setUnitPrice((next.unitPriceCents / 100).toFixed(2));
        setStatus(next.status);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Custom credit plan could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, channel]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || saving) return;
    const amount = unitPrice.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
      setError("Enter a valid price per credit.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await saveCustomCreditPlan(accessToken, channel, {
        name: name.trim(),
        status,
        currency,
        unitPriceCents: Math.round(Number(amount) * 100),
        expectedVersion: plan?.version ?? 0,
      });
      setPlan(next);
      setNotice("Custom credit plan saved.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Custom credit plan could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom credits</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          {channel === "MOBILE"
            ? "Set the mobile price per credit for purchases of 1–1,000 credits. Regular Mobile Plans keep their own prices."
            : "Set a Store price per credit for custom quantity quotes. Store payment and credit granting will be enabled with a paid checkout."}
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">
            Loading custom credit plan…
          </p>
        ) : (
          <form
            onSubmit={(event) => void save(event)}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="grid gap-2">
              <Label htmlFor={`${channel}-custom-name`}>Plan name</Label>
              <Input
                id={`${channel}-custom-name`}
                required
                minLength={2}
                maxLength={160}
                value={name}
                disabled={!canManage}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${channel}-custom-price`}>
                Price per credit
              </Label>
              <Input
                id={`${channel}-custom-price`}
                required
                inputMode="decimal"
                value={unitPrice}
                disabled={!canManage}
                onChange={(event) => setUnitPrice(event.target.value)}
              />
            </div>
            {channel === "STORE" && (
              <div className="grid gap-2">
                <Label htmlFor="store-custom-currency">Currency</Label>
                <Input
                  id="store-custom-currency"
                  required
                  maxLength={3}
                  pattern="[A-Z]{3}"
                  value={currency}
                  disabled={!canManage}
                  onChange={(event) =>
                    setCurrency(event.target.value.toUpperCase())
                  }
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor={`${channel}-custom-status`}>Status</Label>
              <SelectMenu
                id={`${channel}-custom-status`}
                ariaLabel="Custom credit plan status"
                value={status}
                options={[
                  { value: "INACTIVE", label: "Inactive" },
                  { value: "ACTIVE", label: "Active" },
                ]}
                onChange={setStatus}
                disabled={!canManage}
              />
            </div>
            {canManage && (
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : plan ? "Save plan" : "Create plan"}
              </Button>
            )}
          </form>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-3 text-sm">
            {notice}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
