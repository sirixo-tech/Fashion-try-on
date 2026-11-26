"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { toDataURL } from "qrcode";
import {
  Button,
  buttonVariants,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@selfx/ui";
import { selfxApi, clearApiReadCache } from "@/lib/api";
import type { PricingPlan } from "@/lib/pricing";
import type { StoreSubscriptionSummary } from "@/lib/stores";

export type StorePlanPayment = {
  id: string;
  planId: string;
  planName: string;
  status: string;
  amountMinor: number;
  currency: string;
  purpose: "PLAN" | "USAGE";
  checkoutUrl: string | null;
  expiresAt: string;
  effectiveAfter: string | null;
};
export type StorePlanWorkspace = {
  summary: StoreSubscriptionSummary;
  billingOwner: "SHOPIFY" | "SELFX";
  manageUrl: string | null;
  phonepeAvailable: boolean;
  canManage: boolean;
  scheduled: { planName: string; effectiveAfter: string } | null;
  payments: StorePlanPayment[];
};

export function useStorePlanSelection(
  accessToken: string | null,
  storeId: string | null,
  onChanged?: () => void,
) {
  const [loaded, setLoaded] = useState<{
    key: string;
    value: StorePlanWorkspace;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const requests = useRef(new Map<string, string>());
  const active = useRef("");
  const inflight = useRef(false);
  const key = `${accessToken ?? ""}:${storeId ?? ""}`;
  active.current = key;
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const previous = useRef("");
  const load = useCallback(async () => {
    if (!accessToken || !storeId) return;
    try {
      const value = await selfxApi<StorePlanWorkspace>(
        `/api/v1/admin/stores/${storeId}/plan-selection`,
        { accessToken, cache: "no-store" },
      );
      if (active.current !== key) return;
      const signature = JSON.stringify([value.summary, value.scheduled]);
      if (previous.current !== signature) {
        clearApiReadCache();
        if (previous.current)
          window.dispatchEvent(new Event("selfx:permissions-changed"));
        changed.current?.();
      }
      previous.current = signature;
      setLoaded({ key, value });
      setFailure(null);
    } catch (error) {
      if (active.current === key) {
        setFailure({
          key,
          message:
            error instanceof Error
              ? error.message
              : "Plan management is temporarily unavailable.",
        });
      }
    }
  }, [accessToken, storeId, key]);
  useEffect(() => {
    previous.current = "";
    requests.current.clear();
    setBusy(false);
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const interval = setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  const run = async (path: string, body?: object) => {
    if (!accessToken || !storeId || inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await selfxApi<StorePlanPayment>(
        `/api/v1/admin/stores/${storeId}/plan-selection${path}`,
        {
          accessToken,
          method: "POST",
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      if (active.current !== key) return;
      await load();
      changed.current?.();
    } catch (error) {
      if (active.current === key) {
        await load();
        changed.current?.();
        setFailure({
          key,
          message:
            error instanceof Error
              ? error.message
              : "The request could not be completed. Check its status before retrying.",
        });
      }
    } finally {
      inflight.current = false;
      if (active.current === key) setBusy(false);
    }
  };
  return {
    workspace: loaded?.key === key ? loaded.value : null,
    error: failure?.key === key ? failure.message : null,
    busy,
    refresh: load,
    choose: async (plan: PricingPlan) => {
      const requestKey = `${plan.id}:${plan.updatedAt}`;
      if (
        loaded?.value.payments.find(
          (payment) => payment.planId === plan.id && payment.purpose === "PLAN",
        )?.status === "FAILED"
      )
        requests.current.delete(requestKey);
      const id = requests.current.get(requestKey) ?? crypto.randomUUID();
      requests.current.set(requestKey, id);
      await run("", {
        planId: plan.id,
        planUpdatedAt: plan.updatedAt,
        clientRequestId: id,
        acceptTerms: true,
      });
    },
    check: (id: string) => run(`/payments/${id}/check`),
    pay: (id: string) => run(`/payments/${id}/pay`),
    cancel: (id: string) => run(`/payments/${id}/cancel`),
  };
}
export type StorePlanControls = ReturnType<typeof useStorePlanSelection>;
const paymentStatusLabels: Record<string, string> = {
  DUE: "Payment due",
  FAILED: "Payment not completed",
  INITIALIZING: "Preparing payment",
  INITIATING: "Preparing payment",
  PENDING: "Awaiting payment",
  UNKNOWN: "Checking payment",
  REVIEW_REQUIRED: "Needs review",
};

export function StorePlanPayments({
  controls,
}: {
  controls: StorePlanControls;
}) {
  const workspace = controls.workspace;
  const [qr, setQr] = useState<{ id: string; image: string } | null>(null);
  const pending = workspace?.payments.find(
    (p) => p.status === "PENDING" && p.checkoutUrl?.startsWith("upi:"),
  );
  useEffect(() => {
    let cancelled = false;
    if (pending?.checkoutUrl)
      void toDataURL(pending.checkoutUrl, { width: 256, margin: 2 })
        .then((image) => {
          if (!cancelled) setQr({ id: pending.id, image });
        })
        .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pending?.id, pending?.checkoutUrl]);
  return (
    <div className="grid gap-3 border-b p-5">
      {controls.error ? (
        <p role="alert" className="text-sm text-destructive">
          {controls.error}
        </p>
      ) : null}
      {workspace?.billingOwner === "SHOPIFY" ? (
        <p className="text-sm">
          Shopify handles this Store’s payment approval. Plan changes update
          SelfX and WooCommerce after verification.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Pay through SelfX’s PhonePe account. Fixed plans cover one month and
          require a new payment to renew. Usage-only plans are billed monthly;
          unpaid completed usage pauses Try-On. Starter is a one-time Store
          trial.
        </p>
      )}
      {workspace?.scheduled ? (
        <p role="status" className="text-sm font-medium">
          Changes to {workspace.scheduled.planName} on{" "}
          {new Date(workspace.scheduled.effectiveAfter).toLocaleDateString()}.
        </p>
      ) : null}
      {workspace && !workspace.canManage ? (
        <p className="text-sm text-muted-foreground">
          A Store administrator with payment management access can change plans.
        </p>
      ) : null}
      {workspace?.payments
        .filter((p) =>
          [
            "DUE",
            "FAILED",
            "INITIALIZING",
            "INITIATING",
            "PENDING",
            "UNKNOWN",
            "REVIEW_REQUIRED",
          ].includes(p.status),
        )
        .map((payment) => (
          <div
            key={payment.id}
            className="grid gap-2 rounded-lg border p-3 text-sm"
          >
            <p>
              {payment.purpose === "USAGE"
                ? "Completed usage bill"
                : payment.planName}
              :{" "}
              {new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: payment.currency,
              }).format(payment.amountMinor / 100)}{" "}
              · {paymentStatusLabels[payment.status] ?? "Checking payment"}
            </p>
            {payment.status === "REVIEW_REQUIRED" ? (
              <p>
                Payment was received, but the Store changed before activation.
                SelfX must review this payment before another plan change.
              </p>
            ) : null}
            {payment.id === pending?.id && qr?.id === payment.id ? (
              <Image
                src={qr.image}
                alt="Scan to pay SelfX through PhonePe"
                width={256}
                height={256}
                unoptimized
              />
            ) : null}
            {payment.checkoutUrl?.startsWith("https:") ? (
              <a
                className={buttonVariants({ variant: "outline" })}
                href={payment.checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open PhonePe checkout
              </a>
            ) : null}
            {workspace.canManage && payment.status === "PENDING" ? (
              <Button
                variant="outline"
                disabled={controls.busy}
                onClick={() => void controls.cancel(payment.id)}
              >
                Cancel payment
              </Button>
            ) : null}
            {workspace.canManage &&
            payment.purpose === "USAGE" &&
            ["DUE", "FAILED"].includes(payment.status) ? (
              <Button
                disabled={controls.busy}
                onClick={() => void controls.pay(payment.id)}
              >
                Pay usage bill
              </Button>
            ) : null}
            {workspace.canManage &&
            ["INITIALIZING", "INITIATING", "PENDING", "UNKNOWN"].includes(
              payment.status,
            ) ? (
              <Button
                variant="outline"
                disabled={controls.busy}
                onClick={() => void controls.check(payment.id)}
              >
                Check payment status
              </Button>
            ) : null}
          </div>
        ))}
      <Button
        variant="outline"
        disabled={controls.busy}
        onClick={() => void controls.refresh()}
      >
        Refresh plan status
      </Button>
    </div>
  );
}

export function StorePlanAction({
  controls,
  plan,
  current,
}: {
  controls: StorePlanControls;
  plan: PricingPlan;
  current: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const workspace = controls.workspace;
  const trial =
    plan.code === "selfx-default-starter" ||
    (plan.billingMode !== "POSTPAID_PAYG" && plan.monthlyPriceCents <= 0);
  const expired =
    workspace?.summary.subscription?.currentPeriodEnd &&
    new Date(workspace.summary.subscription.currentPeriodEnd) <= new Date();
  if (
    current &&
    !(
      expired &&
      workspace?.billingOwner === "SELFX" &&
      plan.billingMode !== "POSTPAID_PAYG"
    )
  )
    return (
      <Button className="mt-4 w-full" variant="outline" disabled>
        Current plan
      </Button>
    );
  if (trial)
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        One-time trial; cannot be selected again.
      </p>
    );
  if (workspace?.billingOwner === "SHOPIFY")
    return workspace.canManage && workspace.manageUrl ? (
      <a
        className={`${buttonVariants({ variant: "outline" })} mt-4 w-full`}
        href={workspace.manageUrl}
      >
        Choose in Shopify
      </a>
    ) : (
      <Button className="mt-4 w-full" variant="outline" disabled>
        Choose in Shopify
      </Button>
    );
  const pending = workspace?.payments.some(
    (p) =>
      p.purpose === "PLAN" &&
      [
        "INITIALIZING",
        "INITIATING",
        "PENDING",
        "UNKNOWN",
        "SCHEDULED",
        "REVIEW_REQUIRED",
      ].includes(p.status),
  );
  const supported =
    plan.currency === "INR" &&
    !(plan.billingMode === "POSTPAID_PAYG" && plan.monthlyPriceCents > 0);
  return (
    <>
      <Button
        className="mt-4 w-full"
        variant="outline"
        disabled={
          !workspace?.canManage ||
          !workspace.phonepeAvailable ||
          controls.busy ||
          pending ||
          !supported
        }
        onClick={() => {
          setAccepted(false);
          setOpen(true);
        }}
      >
        Choose plan
      </Button>
      {!supported ? (
        <p className="mt-2 text-xs text-muted-foreground">
          PhonePe requires an INR fixed-price or usage-only plan.
        </p>
      ) : null}
      {workspace && !workspace.phonepeAvailable ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Store payments are not enabled yet.
        </p>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose {plan.name}</DialogTitle>
            <DialogDescription>
              {plan.billingMode === "POSTPAID_PAYG"
                ? `${new Intl.NumberFormat(undefined, { style: "currency", currency: plan.currency }).format((plan.creditUnitPriceCents ?? 0) / 100)} per successful Try-On, billed monthly.`
                : `${new Intl.NumberFormat(undefined, { style: "currency", currency: plan.currency }).format(plan.monthlyPriceCents / 100)} for one month.`}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            {workspace?.summary.subscription?.status === "ACTIVE" &&
            workspace.summary.subscription.currentPeriodEnd &&
            new Date(workspace.summary.subscription.currentPeriodEnd) >
              new Date()
              ? `Starts at renewal on ${new Date(workspace.summary.subscription.currentPeriodEnd).toLocaleDateString()}. Your current plan continues until then.`
              : "Starts after payment verification or acceptance of usage terms."}{" "}
            Credits and usage are shared across this Store’s connected
            applications. Trial credits are never renewed.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={accepted}
              onCheckedChange={(value) => setAccepted(value === true)}
            />
            I accept the displayed charges and start date, including monthly
            usage bills and pausing overdue usage where applicable.
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!accepted || controls.busy}
              onClick={async () => {
                await controls.choose(plan);
                setOpen(false);
              }}
            >
              {controls.busy
                ? "Processing…"
                : plan.billingMode === "POSTPAID_PAYG"
                  ? "Accept usage plan"
                  : "Continue to PhonePe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
