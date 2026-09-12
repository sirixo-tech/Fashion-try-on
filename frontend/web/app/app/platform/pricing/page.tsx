"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CreditCardIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
} from "lucide-react";

import {
  Badge,
  Button,
  PageContainer,
  PageHeader,
  PageSection,
  SelectMenu,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import {
  createPricingPlan,
  listPricingPlans,
  updatePricingPlan,
  type PricingPlan,
  type PricingPlanChannel,
  type PricingPlanInput,
  type PricingPlanStatus,
} from "@/lib/pricing";
import { useSession } from "@/lib/session";

const channelOptions: PricingPlanChannel[] = ["SHOPIFY", "KIOSK", "PUBLIC_API"];
const statusOptions: Array<{ value: PricingPlanStatus; label: string }> = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "ARCHIVED", label: "Archived" },
];

type PlanFormState = {
  id?: string;
  code: string;
  name: string;
  status: PricingPlanStatus;
  channels: PricingPlanChannel[];
  currency: string;
  monthlyPrice: string;
  includedCredits: string;
  trialCredits: string;
  extraCreditPrice: string;
  kioskMonthlyRent: string;
  kioskDeviceLimit: string;
};

const emptyForm: PlanFormState = {
  code: "",
  name: "",
  status: "ACTIVE",
  channels: ["SHOPIFY"],
  currency: "USD",
  monthlyPrice: "0",
  includedCredits: "1000",
  trialCredits: "10",
  extraCreditPrice: "",
  kioskMonthlyRent: "",
  kioskDeviceLimit: "",
};

export default function PricingControlPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [form, setForm] = useState<PlanFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === form.id) ?? null,
    [form.id, plans],
  );

  const loadPlans = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setPlans(await listPricingPlans(accessToken));
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  async function savePlan() {
    if (!accessToken) {
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = formToInput(form);
      const saved = form.id
        ? await updatePricingPlan(accessToken, form.id, payload)
        : await createPricingPlan(accessToken, { ...payload, code: form.code });
      setPlans((current) => upsertPlan(current, saved));
      setForm(formFromPlan(saved));
      setNotice(`${saved.name} saved.`);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Platform"
        title="Pricing Control"
        description="Central plan, credit and kiosk rental configuration."
        status={<Badge variant="secondary">{plans.length} plans</Badge>}
        actions={
          <>
            <Button variant="outline" onClick={() => void loadPlans()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => setForm(emptyForm)}>
              <PlusIcon aria-hidden="true" />
              New plan
            </Button>
          </>
        }
      />

      {error ? (
        <PageSection>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        </PageSection>
      ) : null}

      {notice ? (
        <PageSection>
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
            {notice}
          </div>
        </PageSection>
      ) : null}

      <PageSection>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <TableContainer
            title="Plans"
            actions={<CreditCardIcon size={18} aria-hidden="true" />}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Monthly</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6}>Loading pricing plans...</TableCell>
                  </TableRow>
                ) : plans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>No pricing plans yet.</TableCell>
                  </TableRow>
                ) : (
                  plans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell>
                        <div className="font-medium">{plan.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {plan.code}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            plan.status === "ACTIVE" ? "default" : "secondary"
                          }
                        >
                          {plan.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{plan.channels.join(", ")}</TableCell>
                      <TableCell>
                        {money(plan.monthlyPriceCents, plan.currency)}
                      </TableCell>
                      <TableCell>
                        {number(plan.includedCredits)} +{" "}
                        {number(plan.trialCredits)} trial
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setForm(formFromPlan(plan))}
                        >
                          <PencilIcon aria-hidden="true" />
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <div className="rounded-lg border bg-card p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {selectedPlan ? "Edit Plan" : "New Plan"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedPlan?.code ?? "Define a new pricing plan."}
                </p>
              </div>
              <Badge variant="secondary">{form.status}</Badge>
            </div>

            <div className="grid gap-3">
              <TextField
                label="Plan code"
                value={form.code}
                disabled={Boolean(form.id)}
                onChange={(code) => setForm((current) => ({ ...current, code }))}
              />
              <TextField
                label="Plan name"
                value={form.name}
                onChange={(name) => setForm((current) => ({ ...current, name }))}
              />
              <label className="grid gap-2 text-sm font-medium">
                Status
                <SelectMenu
                  ariaLabel="Plan status"
                  value={form.status}
                  options={statusOptions}
                  className="h-10"
                  onChange={(status) =>
                    setForm((current) => ({
                      ...current,
                      status: status as PricingPlanStatus,
                    }))
                  }
                />
              </label>
              <TextField
                label="Currency"
                value={form.currency}
                maxLength={3}
                onChange={(currency) =>
                  setForm((current) => ({
                    ...current,
                    currency: currency.toUpperCase(),
                  }))
                }
              />
              <ChannelPicker
                value={form.channels}
                onChange={(channels) =>
                  setForm((current) => ({ ...current, channels }))
                }
              />
              <NumberField
                label="Monthly price"
                value={form.monthlyPrice}
                onChange={(monthlyPrice) =>
                  setForm((current) => ({ ...current, monthlyPrice }))
                }
              />
              <NumberField
                label="Included credits"
                value={form.includedCredits}
                onChange={(includedCredits) =>
                  setForm((current) => ({ ...current, includedCredits }))
                }
              />
              <NumberField
                label="Trial credits"
                value={form.trialCredits}
                onChange={(trialCredits) =>
                  setForm((current) => ({ ...current, trialCredits }))
                }
              />
              <NumberField
                label="Extra credit price"
                value={form.extraCreditPrice}
                onChange={(extraCreditPrice) =>
                  setForm((current) => ({ ...current, extraCreditPrice }))
                }
              />
              <NumberField
                label="Kiosk monthly rent"
                value={form.kioskMonthlyRent}
                onChange={(kioskMonthlyRent) =>
                  setForm((current) => ({ ...current, kioskMonthlyRent }))
                }
              />
              <NumberField
                label="Kiosk device limit"
                value={form.kioskDeviceLimit}
                step="1"
                onChange={(kioskDeviceLimit) =>
                  setForm((current) => ({ ...current, kioskDeviceLimit }))
                }
              />
              <Button onClick={() => void savePlan()} disabled={saving}>
                <SaveIcon aria-hidden="true" />
                {saving ? "Saving..." : "Save plan"}
              </Button>
            </div>
          </div>
        </div>
      </PageSection>
    </PageContainer>
  );
}

function TextField({
  label,
  value,
  maxLength,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  maxLength?: number;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  step = "0.01",
  onChange,
}: {
  label: string;
  value: string;
  step?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ChannelPicker({
  value,
  onChange,
}: {
  value: PricingPlanChannel[];
  onChange: (value: PricingPlanChannel[]) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">Channels</legend>
      <div className="grid gap-2 rounded-md border p-3">
        {channelOptions.map((channel) => (
          <label
            key={channel}
            className="flex items-center gap-2 text-sm font-medium"
          >
            <input
              type="checkbox"
              checked={value.includes(channel)}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...value, channel]
                  : value.filter((item) => item !== channel);
                onChange(next.length > 0 ? next : value);
              }}
            />
            {channel}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function formFromPlan(plan: PricingPlan): PlanFormState {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    status: plan.status,
    channels: plan.channels,
    currency: plan.currency,
    monthlyPrice: centsToMoneyInput(plan.monthlyPriceCents),
    includedCredits: String(plan.includedCredits),
    trialCredits: String(plan.trialCredits),
    extraCreditPrice:
      plan.extraCreditPriceCents === null
        ? ""
        : centsToMoneyInput(plan.extraCreditPriceCents),
    kioskMonthlyRent:
      plan.kioskMonthlyRentCents === null
        ? ""
        : centsToMoneyInput(plan.kioskMonthlyRentCents),
    kioskDeviceLimit:
      plan.kioskDeviceLimit === null ? "" : String(plan.kioskDeviceLimit),
  };
}

function formToInput(form: PlanFormState): PricingPlanInput {
  return {
    name: form.name.trim(),
    status: form.status,
    channels: form.channels,
    currency: form.currency.trim().toUpperCase(),
    monthlyPriceCents: moneyInputToCents(form.monthlyPrice),
    includedCredits: integerInput(form.includedCredits),
    trialCredits: integerInput(form.trialCredits),
    extraCreditPriceCents: optionalMoneyInputToCents(form.extraCreditPrice),
    kioskMonthlyRentCents: optionalMoneyInputToCents(form.kioskMonthlyRent),
    kioskDeviceLimit: optionalIntegerInput(form.kioskDeviceLimit),
  };
}

function upsertPlan(plans: PricingPlan[], saved: PricingPlan): PricingPlan[] {
  const exists = plans.some((plan) => plan.id === saved.id);
  return exists
    ? plans.map((plan) => (plan.id === saved.id ? saved : plan))
    : [saved, ...plans];
}

function moneyInputToCents(value: string): number {
  return Math.round(Number(value || "0") * 100);
}

function optionalMoneyInputToCents(value: string): number | null {
  return value.trim() === "" ? null : moneyInputToCents(value);
}

function integerInput(value: string): number {
  return Math.max(0, Math.trunc(Number(value || "0")));
}

function optionalIntegerInput(value: string): number | null {
  return value.trim() === "" ? null : integerInput(value);
}

function centsToMoneyInput(value: number): string {
  return (value / 100).toFixed(2);
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(value / 100);
}

function number(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value,
  );
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  if (caught instanceof Error) {
    return caught.message;
  }
  return "Pricing plans could not be loaded.";
}
