"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  CreditCardIcon,
  EyeIcon,
  EyeOffIcon,
  SaveIcon,
  StoreIcon,
  UserIcon,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  FormActions,
  FormSection,
  Input,
  Label,
  LoadingState,
  ErrorState,
  PageContainer,
  PageHeader,
  PageSection,
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { listPricingPlans, type PricingPlan } from "@/lib/pricing";
import { useSession } from "@/lib/session";
import { onboardStore } from "@/lib/stores";

export default function CreateStorePage() {
  const router = useRouter();
  const session = useSession();
  const token = session.status === "authenticated" ? session.accessToken : null;
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [planId, setPlanId] = useState("");
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
    timezone: "UTC",
    ownerName: "",
    ownerEmail: "",
    ownerPassword: "",
    confirmation: "",
  });
  const selected = plans.find((plan) => plan.id === planId);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setAllowed(false);
    setError(null);
    void (async () => {
      try {
        const access = await getCurrentPlatformAccess(token);
        const permitted =
          access.isSuperadmin ||
          (access.permissions.includes("STORES_CREATE") &&
            access.permissions.includes("PRICING_MANAGE"));
        if (cancelled) return;
        setAllowed(permitted);
        if (!permitted) return;
        const activePlans = (await listPricingPlans(token)).filter(
          (plan) => plan.status === "ACTIVE",
        );
        if (cancelled) return;
        setPlans(activePlans);
        setPlanId((current) =>
          activePlans.some((plan) => plan.id === current)
            ? current
            : (activePlans[0]?.id ?? ""),
        );
      } catch (caught) {
        if (!cancelled) setError(messageFor(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, reload]);

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selected || !allowed || submitting.current) return;
    if (form.ownerPassword !== form.confirmation) {
      setError("Passwords do not match.");
      return;
    }
    if (!form.name.trim() || !form.ownerName.trim()) {
      setError("Store name and owner name are required.");
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const store = await onboardStore(token, {
        name: form.name.trim(),
        ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
        ...(form.contactEmail.trim()
          ? { contactEmail: form.contactEmail.trim() }
          : {}),
        ...(form.contactPhone.trim()
          ? { contactPhone: form.contactPhone.trim() }
          : {}),
        ...(form.address.trim() ? { address: form.address.trim() } : {}),
        timezone: form.timezone.trim() || "UTC",
        pricingPlanId: selected.id,
        ownerName: form.ownerName.trim(),
        ownerEmail: form.ownerEmail.trim().toLowerCase(),
        ownerPassword: form.ownerPassword,
      });
      setForm((current) => ({
        ...current,
        ownerPassword: "",
        confirmation: "",
      }));
      router.push(`/app/stores/${store.id}`);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  if (loading)
    return (
      <PageContainer width="wide">
        <LoadingState label="Loading Store setup" />
      </PageContainer>
    );
  if (!allowed)
    return (
      <PageContainer width="wide">
        <ErrorState
          title="Store creation unavailable"
          description={
            error ??
            "Store creation and pricing management permissions are required."
          }
          action={{
            label: "Retry",
            onClick: () => setReload((value) => value + 1),
          }}
        />
      </PageContainer>
    );

  return (
    <PageContainer width="wide">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link
          href="/app/stores"
          className="inline-flex items-center gap-2 hover:text-foreground"
        >
          <ArrowLeftIcon size={16} />
          Stores
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Create Store</span>
      </nav>
      <PageHeader eyebrow="Platform" title="Create Store" />
      <form onSubmit={(event) => void submit(event)} className="space-y-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to create Store</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
          <fieldset disabled={saving} className="min-w-0 space-y-6">
            <PageSection>
              <FormSection title="Store details">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="store-name">Store name</Label>
                    <Input
                      id="store-name"
                      required
                      maxLength={200}
                      value={form.name}
                      onChange={(event) => update("name", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="store-slug">Store slug (optional)</Label>
                    <Input
                      id="store-slug"
                      minLength={3}
                      maxLength={120}
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      value={form.slug}
                      onChange={(event) => update("slug", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-email">
                      Contact email (optional)
                    </Label>
                    <Input
                      id="contact-email"
                      type="email"
                      maxLength={254}
                      value={form.contactEmail}
                      onChange={(event) =>
                        update("contactEmail", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-phone">
                      Contact phone (optional)
                    </Label>
                    <Input
                      id="contact-phone"
                      type="tel"
                      maxLength={40}
                      value={form.contactPhone}
                      onChange={(event) =>
                        update("contactPhone", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="store-address">Address (optional)</Label>
                    <Input
                      id="store-address"
                      maxLength={240}
                      value={form.address}
                      onChange={(event) =>
                        update("address", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="store-timezone">Timezone</Label>
                    <Input
                      id="store-timezone"
                      required
                      maxLength={64}
                      value={form.timezone}
                      onChange={(event) =>
                        update("timezone", event.target.value)
                      }
                    />
                  </div>
                </div>
              </FormSection>
            </PageSection>
            <PageSection>
              <FormSection title="Plan">
                {plans.length ? (
                  <div
                    className="grid gap-3 md:grid-cols-2"
                    role="radiogroup"
                    aria-label="Store plan"
                  >
                    {plans.map((plan) => (
                      <label
                        key={plan.id}
                        className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-md border p-4 ${planId === plan.id ? "border-primary bg-primary/5" : "bg-background"}`}
                      >
                        <input
                          type="radio"
                          name="plan"
                          value={plan.id}
                          checked={planId === plan.id}
                          onChange={() => setPlanId(plan.id)}
                          className="mt-1 h-4 w-4 shrink-0 accent-primary"
                          required
                        />
                        <span className="min-w-0 space-y-2">
                          <span className="block break-words font-semibold">
                            {plan.name}
                          </span>
                          <span className="block font-medium">
                            {priceFor(plan)}{" "}
                            <span className="text-sm font-normal text-muted-foreground">
                              / month
                            </span>
                          </span>
                          <span className="block text-sm text-muted-foreground">
                            {plan.includedCredits.toLocaleString()} credits
                            {plan.trialCredits > 0
                              ? ` + ${plan.trialCredits.toLocaleString()} trial`
                              : ""}
                            {plan.storeLocationLimit !== 0
                              ? ` | ${plan.storeLocationLimit === null ? "Unlimited" : plan.storeLocationLimit} locations`
                              : ""}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <Alert>
                    <AlertTitle>No active plans available</AlertTitle>
                    <AlertDescription>
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => setReload((value) => value + 1)}
                      >
                        Reload plans
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
              </FormSection>
            </PageSection>
            <PageSection>
              <FormSection title="Owner account">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="owner-name">Owner full name</Label>
                    <Input
                      id="owner-name"
                      required
                      maxLength={120}
                      autoComplete="off"
                      value={form.ownerName}
                      onChange={(event) =>
                        update("ownerName", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="owner-email">Login email</Label>
                    <Input
                      id="owner-email"
                      type="email"
                      required
                      maxLength={254}
                      autoComplete="off"
                      value={form.ownerEmail}
                      onChange={(event) =>
                        update("ownerEmail", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="owner-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="owner-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        minLength={12}
                        maxLength={256}
                        value={form.ownerPassword}
                        onChange={(event) =>
                          update("ownerPassword", event.target.value)
                        }
                        className="pr-12"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        title={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword((value) => !value)}
                      >
                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={256}
                      value={form.confirmation}
                      onChange={(event) =>
                        update("confirmation", event.target.value)
                      }
                    />
                  </div>
                </div>
              </FormSection>
            </PageSection>
          </fieldset>
          <aside
            className="min-w-0 space-y-4 border-t pt-4 xl:sticky xl:top-6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0"
            aria-label="Onboarding summary"
          >
            <h2 className="text-base font-semibold">Onboarding summary</h2>
            <dl className="space-y-5 text-sm">
              <div>
                <dt className="mb-1 flex items-center gap-2 text-muted-foreground">
                  <StoreIcon size={16} />
                  Store
                </dt>
                <dd className="break-words">{form.name.trim() || "Not set"}</dd>
              </div>
              <div>
                <dt className="mb-1 flex items-center gap-2 text-muted-foreground">
                  <CreditCardIcon size={16} />
                  Plan
                </dt>
                <dd className="break-words">
                  {selected
                    ? `${selected.name} | ${priceFor(selected)} / month`
                    : "Not selected"}
                </dd>
              </div>
              <div>
                <dt className="mb-1 flex items-center gap-2 text-muted-foreground">
                  <UserIcon size={16} />
                  Owner
                </dt>
                <dd className="break-words">
                  {form.ownerName.trim() || "Not set"}
                </dd>
                <dd className="break-all text-muted-foreground">
                  {form.ownerEmail.trim()}
                </dd>
              </div>
              <div>
                <dt className="mb-1 text-muted-foreground">Status</dt>
                <dd className="flex items-center gap-2">
                  <CheckIcon size={16} className="text-emerald-600" />
                  Active on creation
                </dd>
              </div>
            </dl>
          </aside>
        </div>
        <div className="border-t pt-4">
          <FormActions>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => router.push("/app/stores")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !selected}>
              <SaveIcon aria-hidden="true" />
              {saving ? "Creating Store..." : "Create Store"}
            </Button>
          </FormActions>
        </div>
      </form>
    </PageContainer>
  );
}

function priceFor(plan: PricingPlan) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: plan.currency,
  }).format(plan.monthlyPriceCents / 100);
}

function messageFor(error: unknown) {
  return error instanceof SafeApiError
    ? error.message
    : "Store setup could not be completed. Please try again.";
}
