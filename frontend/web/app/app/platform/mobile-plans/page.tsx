"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PencilIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  Input,
  Label,
  LoadingState,
  PageContainer,
  PageHeader,
  PageSection,
  SelectMenu,
  Textarea,
} from "@selfx/ui";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import {
  createMobilePlan,
  getSharedCreditPrice,
  listMobilePlans,
  saveSharedCreditPrice,
  updateMobilePlan,
  type MobileBillingPeriod,
  type MobilePlan,
  type MobilePlanInput,
  type MobilePlanStatus,
  type SharedCreditPrice,
} from "@/lib/mobile-plans";
import { useSession } from "@/lib/session";

type Draft = {
  code: string;
  name: string;
  description: string;
  status: MobilePlanStatus;
  currency: string;
  price: string;
  billingPeriod: MobileBillingPeriod;
  includedCredits: string;
  trialCredits: string;
};

const blankDraft: Draft = {
  code: "",
  name: "",
  description: "",
  status: "INACTIVE",
  currency: "INR",
  price: "",
  billingPeriod: "MONTHLY",
  includedCredits: "",
  trialCredits: "0",
};

function toDraft(plan: MobilePlan): Draft {
  return {
    code: plan.code,
    name: plan.name,
    description: plan.description,
    status: plan.status,
    currency: plan.currency,
    price: (plan.priceCents / 100).toFixed(2),
    billingPeriod: plan.billingPeriod,
    includedCredits: String(plan.includedCredits),
    trialCredits: String(plan.trialCredits),
  };
}

function toInput(draft: Draft, unitPriceCents: number | null): MobilePlanInput {
  const price = draft.price.trim();
  const sharedRate = draft.currency === "INR" ? unitPriceCents : null;
  const included = Number(draft.includedCredits);
  const trial = Number(draft.trialCredits);
  if (
    (sharedRate === null && !/^\d+(?:\.\d{1,2})?$/.test(price)) ||
    !Number.isSafeInteger(included) ||
    included < 1 ||
    !Number.isSafeInteger(trial) ||
    trial < 0 ||
    !/^[A-Z]{3}$/.test(draft.currency.trim())
  ) {
    throw new Error("Enter a valid currency, price, and credit amounts.");
  }
  return {
    code: draft.code.trim(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    status: draft.status,
    currency: draft.currency.trim(),
    priceCents: sharedRate === null ? Math.round(Number(price) * 100) : included * sharedRate,
    billingPeriod: draft.billingPeriod,
    includedCredits: included,
    trialCredits: trial,
  };
}

export default function MobilePlansPage() {
  const session = useSession();
  const token = session.status === "authenticated" ? session.accessToken : null;
  const [permissions, setPermissions] = useState<{
    view: boolean;
    manage: boolean;
  } | null>(null);
  const [plans, setPlans] = useState<MobilePlan[]>([]);
  const [sharedPrice, setSharedPrice] = useState<SharedCreditPrice | null>(null);
  const [unitPriceInput, setUnitPriceInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const access = await getCurrentPlatformAccess(token);
      const view =
        access.isSuperadmin ||
        access.permissions.includes("PRICING_VIEW") ||
        access.permissions.includes("PRICING_MANAGE");
      const manage =
        access.isSuperadmin || access.permissions.includes("PRICING_MANAGE");
      setPermissions({ view, manage });
      if (view) {
        const [nextPlans, nextPrice] = await Promise.all([listMobilePlans(token), getSharedCreditPrice(token)]);
        setPlans(nextPlans);
        setSharedPrice(nextPrice);
        setUnitPriceInput(nextPrice.unitPriceCents === null ? "" : (nextPrice.unitPriceCents / 100).toFixed(2));
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Mobile plans could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(plan?: MobilePlan) {
    setDraft(plan ? toDraft(plan) : blankDraft);
    setEditing(plan?.id ?? "new");
    setError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !permissions?.manage || !editing || saving) return;
    setSaving(true);
    setError(null);
    try {
      const input = toInput(draft, sharedPrice?.unitPriceCents ?? null);
      if (editing === "new") {
        await createMobilePlan(token, input);
      } else {
        const { code: _code, ...changes } = input;
        void _code;
        await updateMobilePlan(token, editing, changes);
      }
      setEditing(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Mobile plan could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !permissions?.manage || !sharedPrice || saving) return;
    const amount = unitPriceInput.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
      setError("Enter a valid INR price per credit.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveSharedCreditPrice(token, Math.round(Number(amount) * 100), sharedPrice.version);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Credit price could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !permissions)
    return <LoadingState label="Checking mobile plan access" />;
  if (!permissions)
    return (
      <ErrorState
        title="Mobile Plans unavailable"
        description={error ?? "Pricing access could not be checked."}
      />
    );
  if (permissions && !permissions.view)
    return (
      <ErrorState
        title="Mobile Plans are platform-only"
        description="Pricing access is required to view mobile plans."
      />
    );

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Platform"
        title="Mobile Plans"
        description="Create plans for personal mobile Try-On. Store plans and Store-sponsored credits are managed separately."
        status={<Badge variant="secondary">{plans.length} plans</Badge>}
        actions={
          <>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            {permissions?.manage && (
              <Button onClick={() => startEdit()}>
                <PlusIcon aria-hidden="true" />
                New mobile plan
              </Button>
            )}
          </>
        }
      />
      <PageSection>
        <Card>
          <CardHeader><CardTitle>Shared Try-On credit price</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={(event) => void saveRate(event)} className="flex flex-wrap items-end gap-3">
              <Field label="INR per credit" id="shared-credit-price">
                <Input id="shared-credit-price" inputMode="decimal" value={unitPriceInput}
                  onChange={(event) => setUnitPriceInput(event.target.value)} disabled={!permissions?.manage} />
              </Field>
              {permissions?.manage && <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save price"}</Button>}
            </form>
            <p className="mt-3 text-sm text-muted-foreground">Used for mobile plans, purchases of 1–1,000 credits, and future Store per-credit billing cycles. Completed purchases and existing billing cycles retain their saved prices.</p>
          </CardContent>
        </Card>
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {error}
          </div>
        )}
      </PageSection>
      {editing && permissions?.manage && (
        <PageSection>
          <Card>
            <CardHeader>
              <CardTitle>
                {editing === "new" ? "New mobile plan" : "Edit mobile plan"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(event) => void save(event)}
                className="grid gap-4 md:grid-cols-2"
              >
                <Field label="Plan name" id="mobile-plan-name">
                  <Input
                    id="mobile-plan-name"
                    required
                    maxLength={160}
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Code" id="mobile-plan-code">
                  <Input
                    id="mobile-plan-code"
                    required
                    disabled={editing !== "new"}
                    pattern="[a-z0-9][a-z0-9-]*"
                    minLength={3}
                    maxLength={80}
                    value={draft.code}
                    onChange={(e) =>
                      setDraft({ ...draft, code: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Description"
                  id="mobile-plan-description"
                  className="md:col-span-2"
                >
                  <Textarea
                    id="mobile-plan-description"
                    maxLength={500}
                    value={draft.description}
                    onChange={(e) =>
                      setDraft({ ...draft, description: e.target.value })
                    }
                  />
                </Field>
                <Field label="Status" id="mobile-plan-status">
                  <SelectMenu
                    id="mobile-plan-status"
                    ariaLabel="Plan status"
                    value={draft.status}
                    options={[
                      { value: "INACTIVE", label: "Inactive" },
                      { value: "ACTIVE", label: "Active" },
                      { value: "ARCHIVED", label: "Archived" },
                    ]}
                    onChange={(status) => setDraft({ ...draft, status })}
                  />
                </Field>
                <Field label="Billing period" id="mobile-plan-period">
                  <SelectMenu
                    id="mobile-plan-period"
                    ariaLabel="Billing period"
                    value={draft.billingPeriod}
                    options={[
                      { value: "MONTHLY", label: "Monthly" },
                      { value: "ONE_TIME", label: "One-time" },
                    ]}
                    onChange={(billingPeriod) =>
                      setDraft({ ...draft, billingPeriod })
                    }
                  />
                </Field>
                <Field label="Currency" id="mobile-plan-currency">
                  <Input
                    id="mobile-plan-currency"
                    required
                    maxLength={3}
                    pattern="[A-Z]{3}"
                    value={draft.currency}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        currency: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </Field>
                <Field label="Price" id="mobile-plan-price">
                  <Input
                    id="mobile-plan-price"
                    required
                    inputMode="decimal"
                    placeholder="199.00"
                    disabled={draft.currency === "INR" && sharedPrice?.unitPriceCents !== null && sharedPrice?.unitPriceCents !== undefined}
                    value={draft.currency === "INR" && sharedPrice?.unitPriceCents != null && Number.isInteger(Number(draft.includedCredits)) && Number(draft.includedCredits) > 0 ? (Number(draft.includedCredits) * sharedPrice.unitPriceCents / 100).toFixed(2) : draft.price}
                    onChange={(e) =>
                      setDraft({ ...draft, price: e.target.value })
                    }
                  />
                </Field>
                <Field label="Included Try-On credits" id="mobile-plan-credits">
                  <Input
                    id="mobile-plan-credits"
                    required
                    type="number"
                    min={1}
                    value={draft.includedCredits}
                    onChange={(e) =>
                      setDraft({ ...draft, includedCredits: e.target.value })
                    }
                  />
                </Field>
                <Field label="Intro trial credits" id="mobile-plan-trial">
                  <Input
                    id="mobile-plan-trial"
                    required
                    type="number"
                    min={0}
                    value={draft.trialCredits}
                    onChange={(e) =>
                      setDraft({ ...draft, trialCredits: e.target.value })
                    }
                  />
                </Field>
                <div className="flex gap-2 md:col-span-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save plan"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </PageSection>
      )}
      <PageSection>
        {loading ? (
          <LoadingState label="Loading mobile plans" />
        ) : plans.length === 0 ? (
          <div className="rounded-lg border p-8 text-center text-muted-foreground">
            No mobile plans yet.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <Card key={plan.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle>{plan.name}</CardTitle>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {plan.code}
                      </div>
                    </div>
                    <Badge
                      variant={
                        plan.status === "ACTIVE" ? "default" : "secondary"
                      }
                    >
                      {plan.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm">
                  {plan.description && (
                    <p className="text-muted-foreground">{plan.description}</p>
                  )}
                  <p className="text-xl font-semibold">
                    {new Intl.NumberFormat(undefined, {
                      style: "currency",
                      currency: plan.currency,
                    }).format(plan.priceCents / 100)}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      {plan.billingPeriod === "MONTHLY"
                        ? "/ month"
                        : "one-time"}
                    </span>
                  </p>
                  <p>
                    {plan.includedCredits} Try-On credits
                    {plan.trialCredits > 0
                      ? ` · ${plan.trialCredits} intro trial credits`
                      : ""}
                  </p>
                  {permissions?.manage && (
                    <Button variant="outline" onClick={() => startEdit(plan)}>
                      <PencilIcon aria-hidden="true" />
                      Edit
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </PageSection>
    </PageContainer>
  );
}

function Field({
  label,
  id,
  className,
  children,
}: {
  label: string;
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`grid gap-2 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
