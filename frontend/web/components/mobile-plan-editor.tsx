"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ArrowLeftIcon, SaveIcon } from "lucide-react";
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
  buttonVariants,
} from "@selfx/ui";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import {
  createMobilePlan,
  listMobilePlans,
  updateMobilePlan,
  type MobileBillingPeriod,
  type MobilePlan,
  type MobilePlanInput,
  type MobilePlanStatus,
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
const blank: Draft = {
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
function fromPlan(plan: MobilePlan): Draft {
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
function toInput(draft: Draft): MobilePlanInput {
  const price = draft.price.trim();
  const included = Number(draft.includedCredits);
  const trial = Number(draft.trialCredits);
  if (
    !/^\d+(?:\.\d{1,2})?$/.test(price) ||
    !Number.isSafeInteger(included) ||
    included < 1 ||
    !Number.isSafeInteger(trial) ||
    trial < 0 ||
    !/^[A-Z]{3}$/.test(draft.currency.trim())
  )
    throw new Error("Enter a valid currency, price, and credit amounts.");
  return {
    code: draft.code.trim(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    status: draft.status,
    currency: draft.currency.trim(),
    priceCents: Math.round(Number(price) * 100),
    billingPeriod: draft.billingPeriod,
    includedCredits: included,
    trialCredits: trial,
  };
}

export function MobilePlanEditor({ planId }: { planId?: string }) {
  const router = useRouter();
  const session = useSession();
  const token = session.status === "authenticated" ? session.accessToken : null;
  const [draft, setDraft] = useState<Draft>(blank);
  const [loaded, setLoaded] = useState(false);
  const [canView, setCanView] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!token) return;
    try {
      const access = await getCurrentPlatformAccess(token);
      const view =
        access.isSuperadmin ||
        access.permissions.includes("PRICING_VIEW") ||
        access.permissions.includes("PRICING_MANAGE");
      setCanView(view);
      setCanManage(
        access.isSuperadmin || access.permissions.includes("PRICING_MANAGE"),
      );
      if (!view) return;
      if (planId) {
        const plan = (await listMobilePlans(token)).find(
          (item) => item.id === planId,
        );
        if (!plan) throw new Error("Mobile plan was not found.");
        setDraft(fromPlan(plan));
      }
      setLoaded(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Mobile plan could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [token, planId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManage || saving) return;
    setSaving(true);
    setError(null);
    try {
      const input = toInput(draft);
      if (planId) {
        const { code: _code, ...changes } = input;
        void _code;
        await updateMobilePlan(token, planId, changes);
      } else await createMobilePlan(token, input);
      router.push("/app/platform/mobile-plans");
      router.refresh();
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

  if (loading) return <LoadingState label="Loading mobile plan" />;
  if (!canView)
    return (
      <ErrorState
        title="Mobile Plans are platform-only"
        description={error ?? "Pricing access is required."}
      />
    );
  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Platform"
        title={planId ? "Edit mobile plan" : "New mobile plan"}
        description="Configure plan pricing and Try-On credits."
        status={<Badge variant="secondary">{draft.status}</Badge>}
        actions={
          <>
            {!planId && (
              <Link
                href="/app/platform/mobile-plans/custom"
                className={buttonVariants({ variant: "outline" })}
              >
                Custom credits plan
              </Link>
            )}
            <Link
              href="/app/platform/mobile-plans"
              className={buttonVariants({ variant: "outline" })}
            >
              <ArrowLeftIcon aria-hidden="true" /> Mobile Plans
            </Link>
          </>
        }
      />
      {error && (
        <PageSection>
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {error}
          </div>
        </PageSection>
      )}
      {loaded && (
        <PageSection>
          <form
            onSubmit={(event) => void save(event)}
            className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]"
          >
            <div className="space-y-5">
              <Card appearance="plain">
                <CardHeader>
                  <CardTitle>Name & visibility</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <Field id="mobile-plan-name" label="Plan name">
                    <Input
                      id="mobile-plan-name"
                      required
                      maxLength={160}
                      value={draft.name}
                      onChange={(event) =>
                        setDraft({ ...draft, name: event.target.value })
                      }
                    />
                  </Field>
                  <Field id="mobile-plan-code" label="Code">
                    <Input
                      id="mobile-plan-code"
                      required
                      disabled={Boolean(planId)}
                      pattern="[a-z0-9][a-z0-9-]*"
                      minLength={3}
                      maxLength={80}
                      value={draft.code}
                      onChange={(event) =>
                        setDraft({ ...draft, code: event.target.value })
                      }
                    />
                  </Field>
                  <Field
                    id="mobile-plan-description"
                    label="Description"
                    className="sm:col-span-2"
                  >
                    <Textarea
                      id="mobile-plan-description"
                      maxLength={500}
                      value={draft.description}
                      onChange={(event) =>
                        setDraft({ ...draft, description: event.target.value })
                      }
                    />
                  </Field>
                  <Field id="mobile-plan-status" label="Status">
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
                </CardContent>
              </Card>
              <Card appearance="plain">
                <CardHeader>
                  <CardTitle>Pricing</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <Field id="mobile-plan-period" label="Billing period">
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
                  <Field id="mobile-plan-currency" label="Currency">
                    <Input
                      id="mobile-plan-currency"
                      required
                      maxLength={3}
                      pattern="[A-Z]{3}"
                      value={draft.currency}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          currency: event.target.value.toUpperCase(),
                        })
                      }
                    />
                  </Field>
                  <Field id="mobile-plan-price" label="Price">
                    <Input
                      id="mobile-plan-price"
                      required
                      inputMode="decimal"
                      placeholder="199.00"
                      value={draft.price}
                      onChange={(event) =>
                        setDraft({ ...draft, price: event.target.value })
                      }
                    />
                  </Field>
                </CardContent>
              </Card>
              <Card appearance="plain">
                <CardHeader>
                  <CardTitle>Credits</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <Field
                    id="mobile-plan-credits"
                    label="Included Try-On credits"
                  >
                    <Input
                      id="mobile-plan-credits"
                      required
                      type="number"
                      min={1}
                      value={draft.includedCredits}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          includedCredits: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field id="mobile-plan-trial" label="Intro trial credits">
                    <Input
                      id="mobile-plan-trial"
                      required
                      type="number"
                      min={0}
                      value={draft.trialCredits}
                      onChange={(event) =>
                        setDraft({ ...draft, trialCredits: event.target.value })
                      }
                    />
                  </Field>
                </CardContent>
              </Card>
            </div>
            <aside className="lg:sticky lg:top-6 lg:self-start">
              <Card>
                <CardHeader>
                  <CardTitle>Plan summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="font-semibold">
                    {draft.name || "New mobile plan"}
                  </p>
                  <p>
                    {draft.price
                      ? new Intl.NumberFormat(undefined, {
                          style: "currency",
                          currency: draft.currency,
                        }).format(Number(draft.price) || 0)
                      : "—"}{" "}
                    {draft.billingPeriod === "MONTHLY" ? "/ month" : "one-time"}
                  </p>
                  <p>{draft.includedCredits || "0"} Try-On credits</p>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={saving || !canManage}
                  >
                    <SaveIcon aria-hidden="true" />
                    {saving ? "Saving…" : "Save plan"}
                  </Button>
                </CardContent>
              </Card>
            </aside>
          </form>
        </PageSection>
      )}
    </PageContainer>
  );
}

function Field({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`grid gap-2 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
