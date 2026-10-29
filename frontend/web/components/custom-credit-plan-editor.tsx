"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
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
  buttonVariants,
} from "@selfx/ui";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import {
  getCustomCreditPlan,
  saveCustomCreditPlan,
  type CustomCreditPlan,
} from "@/lib/custom-credit-plans";
import { useSession } from "@/lib/session";

export function CustomCreditPlanEditor() {
  const router = useRouter();
  const session = useSession();
  const token = session.status === "authenticated" ? session.accessToken : null;
  const listHref = "/app/platform/mobile-plans";
  const [plan, setPlan] = useState<CustomCreditPlan | null>(null);
  const [name, setName] = useState("Mobile custom credits");
  const [currency, setCurrency] = useState("INR");
  const [unitPrice, setUnitPrice] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("INACTIVE");
  const [canManage, setCanManage] = useState(false);
  const [canView, setCanView] = useState(false);
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
      const manage =
        access.isSuperadmin || access.permissions.includes("PRICING_MANAGE");
      setCanView(view);
      setCanManage(manage);
      if (!view) return;
      const existing = await getCustomCreditPlan(token, "MOBILE");
      setPlan(existing);
      if (existing) {
        setName(existing.name);
        setCurrency(existing.currency);
        setUnitPrice((existing.unitPriceCents / 100).toFixed(2));
        setStatus(existing.status);
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
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManage || saving) return;
    if (!/^\d+(?:\.\d{1,2})?$/.test(unitPrice.trim())) {
      setError("Enter a valid price per credit.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveCustomCreditPlan(token, "MOBILE", {
        name: name.trim(),
        currency,
        status,
        unitPriceCents: Math.round(Number(unitPrice) * 100),
        expectedVersion: plan?.version ?? 0,
      });
      router.push(listHref);
      router.refresh();
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

  if (loading) return <LoadingState label="Loading custom credit plan" />;
  if (!canView)
    return (
      <ErrorState
        title="Plans are platform-only"
        description={error ?? "Pricing access is required."}
      />
    );
  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Platform"
        title={plan ? "Edit custom credit plan" : "New custom credit plan"}
        description="Set the Mobile custom quantity price. All Mobile plans include the same Try-On access."
        status={<Badge variant="secondary">{status}</Badge>}
        actions={
          <Link
            href={listHref}
            className={buttonVariants({ variant: "outline" })}
          >
            <ArrowLeftIcon aria-hidden="true" /> Mobile Plans
          </Link>
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
      <PageSection>
        <form
          onSubmit={(event) => void save(event)}
          className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]"
        >
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Name & visibility</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="custom-plan-name">Plan name</Label>
                  <Input
                    id="custom-plan-name"
                    required
                    minLength={2}
                    maxLength={160}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={!canManage}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="custom-plan-status">Status</Label>
                  <SelectMenu
                    id="custom-plan-status"
                    ariaLabel="Plan status"
                    value={status}
                    options={[
                      { value: "INACTIVE", label: "Inactive" },
                      { value: "ACTIVE", label: "Active" },
                    ]}
                    onChange={setStatus}
                    disabled={!canManage}
                  />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Pricing</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="custom-plan-price">Price per credit</Label>
                  <Input
                    id="custom-plan-price"
                    required
                    inputMode="decimal"
                    placeholder="10.00"
                    value={unitPrice}
                    onChange={(event) => setUnitPrice(event.target.value)}
                    disabled={!canManage}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="custom-plan-currency">Currency</Label>
                  <Input
                    id="custom-plan-currency"
                    required
                    maxLength={3}
                    pattern="[A-Z]{3}"
                    value={currency}
                    onChange={(event) =>
                      setCurrency(event.target.value.toUpperCase())
                    }
                    disabled
                  />
                </div>
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  A purchase can request 1–1,000 credits. Each quantity uses
                  this price per credit.
                </p>
              </CardContent>
            </Card>
          </div>
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardHeader>
                <CardTitle>Plan summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="font-semibold">{name || "Custom credits"}</p>
                <p>
                  {unitPrice
                    ? new Intl.NumberFormat(undefined, {
                        style: "currency",
                        currency,
                      }).format(Number(unitPrice) || 0)
                    : "—"}{" "}
                  per credit
                </p>
                <p className="text-muted-foreground">
                  Mobile purchases use the configured payment gateway.
                </p>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!canManage || saving}
                >
                  <SaveIcon aria-hidden="true" />
                  {saving ? "Saving…" : "Save plan"}
                </Button>
              </CardContent>
            </Card>
          </aside>
        </form>
      </PageSection>
    </PageContainer>
  );
}
