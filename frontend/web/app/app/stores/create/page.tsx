"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeftIcon,
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
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  FormActions,
  Input,
  Label,
  LoadingState,
  ErrorState,
  PageContainer,
  PageHeader,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@selfx/ui";
import { SafeApiError } from "@/lib/api";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { listPricingPlans, type PricingPlan } from "@/lib/pricing";
import { useSession } from "@/lib/session";
import { onboardStore } from "@/lib/stores";
import styles from "./store-setup.module.css";

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
      <PageContainer width="form">
        <LoadingState label="Loading Store setup" />
      </PageContainer>
    );
  if (!allowed)
    return (
      <PageContainer width="form">
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
    <PageContainer width="medium">
      <div className="space-y-2">
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
        <PageHeader title="Create Store" />
      </div>
      <form onSubmit={(event) => void submit(event)} className={styles.form}>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to create Store</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className={styles.layout}>
          <div className="min-w-0 space-y-4">
            <fieldset disabled={saving} className="min-w-0 space-y-3">
              <Card size="sm" className={styles.card}>
                <CardHeader className="border-b">
                  <CardTitle>
                    <h2 className="flex items-center gap-2 text-base font-semibold">
                      <StoreIcon
                        size={18}
                        className="text-primary"
                        aria-hidden="true"
                      />
                      Store name
                    </h2>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Label htmlFor="store-name" className="sr-only">
                    Store name
                  </Label>
                  <Input
                    id="store-name"
                    placeholder="Store name"
                    required
                    maxLength={200}
                    value={form.name}
                    onChange={(event) => update("name", event.target.value)}
                  />
                </CardContent>
              </Card>
              <Card size="sm" className={styles.card}>
                <CardHeader className="border-b">
                  <CardTitle>
                    <h2 className="flex items-center gap-2 text-base font-semibold">
                      <CreditCardIcon
                        size={18}
                        className="text-primary"
                        aria-hidden="true"
                      />
                      Plan
                    </h2>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {plans.length ? (
                    <Tabs
                      value={planId}
                      onValueChange={(value) => {
                        if (typeof value === "string" && !saving)
                          setPlanId(value);
                      }}
                    >
                      <TabsList aria-label="Store plan">
                        {plans.map((plan) => (
                          <TabsTrigger
                            key={plan.id}
                            value={plan.id}
                            disabled={saving}
                          >
                            {plan.name}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      {plans.map((plan) => (
                        <TabsContent key={plan.id} value={plan.id}>
                          <p className="break-words text-lg font-semibold">
                            {priceFor(plan)}{" "}
                            <span className="text-sm font-normal text-muted-foreground">
                              / month
                            </span>
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {plan.includedCredits.toLocaleString()} credits
                            {plan.trialCredits > 0
                              ? ` + ${plan.trialCredits.toLocaleString()} trial`
                              : ""}
                            {plan.storeLocationLimit !== 0
                              ? ` | ${plan.storeLocationLimit === null ? "Unlimited" : plan.storeLocationLimit} locations`
                              : ""}
                          </p>
                        </TabsContent>
                      ))}
                    </Tabs>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">
                        No active plans available
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => setReload((value) => value + 1)}
                      >
                        Reload plans
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card size="sm" className={styles.card}>
                <CardHeader className="border-b">
                  <CardTitle>
                    <h2 className="flex items-center gap-2 text-base font-semibold">
                      <UserIcon
                        size={18}
                        className="text-primary"
                        aria-hidden="true"
                      />
                      Owner account
                    </h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className={styles.fields}>
                  <div className="space-y-2">
                    <Label htmlFor="owner-name">Owner full name</Label>
                    <Input
                      id="owner-name"
                      placeholder="Full name"
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
                      placeholder="owner@example.com"
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
                        placeholder="At least 12 characters"
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
                      placeholder="Re-enter password"
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
                </CardContent>
              </Card>
            </fieldset>
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
          <aside className={styles.summary} aria-label="Onboarding summary">
            <Card size="sm" className={styles.card}>
              <CardHeader className="border-b">
                <CardTitle>
                  <h2 className="text-base font-semibold">
                    Onboarding summary
                  </h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Store</dt>
                    <dd className="mt-1 break-words font-medium">
                      {form.name.trim() || "Not set"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Plan</dt>
                    <dd className="mt-1 break-words font-medium">
                      {selected?.name ?? "Not selected"}
                    </dd>
                    {selected ? (
                      <dd className="mt-1 text-muted-foreground">
                        {priceFor(selected)} / month
                      </dd>
                    ) : null}
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Owner</dt>
                    <dd className="mt-1 break-words font-medium">
                      {form.ownerName.trim() || "Not set"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Login email</dt>
                    <dd className="mt-1 break-all font-medium">
                      {form.ownerEmail.trim() || "Not set"}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </aside>
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
