"use client";
import { useEffect, useState } from "react";
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
  PageSection,
  SectionCard,
  SelectMenu,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableContainer,
} from "@selfx/ui";
import { SafeApiError } from "@/lib/api";
import {
  cancelShoppingOrder,
  checkOrderPayment,
  recoverOrderStock,
  getShoppingOrder,
  getStoreTax,
  listShoppingOrders,
  parseTaxRate,
  shoppingMoney,
  updateStoreTax,
  type OrderList,
  type ShoppingOrder,
  type StoreTax,
  type TaxMode,
} from "@/lib/shopping";

export function StoreShopping({
  accessToken,
  storeId,
  canEdit,
}: {
  accessToken: string;
  storeId: string;
  canEdit: boolean;
}) {
  return (
    <>
      <StoreTaxPanel
        accessToken={accessToken}
        storeId={storeId}
        canEdit={canEdit}
      />
      <OrderHistory
        accessToken={accessToken}
        storeId={storeId}
        canEdit={canEdit}
      />
    </>
  );
}
function StoreTaxPanel({
  accessToken,
  storeId,
  canEdit,
}: {
  accessToken: string;
  storeId: string;
  canEdit: boolean;
}) {
  const [tax, setTax] = useState<StoreTax | null>(null),
    [mode, setMode] = useState<TaxMode>("OFF");
  const [rate, setRate] = useState("0"),
    [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false),
    [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    setTax(null);
    setError(null);
    setSaved(false);
    void getStoreTax(accessToken, storeId)
      .then((result) => {
        if (current) {
          setTax(result);
          setMode(result.mode);
          setRate((result.rateBasisPoints / 100).toFixed(2));
          setConflict(false);
        }
      })
      .catch((caught) => {
        if (current) setError(message(caught));
      });
    return () => {
      current = false;
    };
  }, [accessToken, storeId, reload]);
  async function save() {
    if (!tax || busy || !canEdit || conflict) return;
    setError(null);
    setSaved(false);
    try {
      const rateBasisPoints = mode === "OFF" ? 0 : parseTaxRate(rate);
      if (rateBasisPoints === null)
        throw new Error("Enter the Store default tax rate.");
      setBusy(true);
      const result = await updateStoreTax(accessToken, storeId, {
        ...tax,
        expectedVersion: tax.version,
        mode,
        rateBasisPoints,
      });
      setTax(result);
      setSaved(true);
    } catch (caught) {
      setError(message(caught));
      if (
        caught instanceof SafeApiError &&
        caught.code === "SHOPPING_TAX_VERSION_CONFLICT"
      )
        setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <PageSection>
      <SectionCard
        title="Store tax settings"
        description="Choose how product prices are used at checkout. Product-specific rates are optional in Stock & Pricing."
      >
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!tax && !error && <p role="status">Loading tax settings…</p>}
        {tax && (
          <div className="space-y-4">
            <fieldset
              disabled={!canEdit || busy || conflict}
              className="grid gap-4 sm:grid-cols-2"
            >
              <div className="space-y-2">
                <Label>Tax mode</Label>
                <SelectMenu
                  ariaLabel="Tax mode"
                  value={mode}
                  disabled={!canEdit || busy || conflict}
                  options={[
                    { value: "OFF", label: "No tax" },
                    {
                      value: "INCLUSIVE",
                      label: "Tax included in product price",
                    },
                    { value: "EXCLUSIVE", label: "Add tax to product price" },
                  ]}
                  onChange={(value) => {
                    setMode(value);
                    setSaved(false);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="store-tax-rate">Default tax rate (%)</Label>
                <Input
                  id="store-tax-rate"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={rate}
                  disabled={mode === "OFF"}
                  onChange={(event) => {
                    setRate(event.target.value);
                    setSaved(false);
                  }}
                />
              </div>
            </fieldset>
            <p className="text-sm text-muted-foreground">
              Existing orders keep their original totals. No tax switches off
              all product overrides. Included tax is broken out of the entered
              price; added tax increases the customer total.
            </p>
            {canEdit && (
              <Button disabled={busy || conflict} onClick={() => void save()}>
                {busy ? "Saving…" : "Save tax settings"}
              </Button>
            )}
            {saved && <p role="status">Tax settings saved.</p>}
          </div>
        )}
        {(conflict || (!tax && error)) && (
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            Reload tax settings
          </Button>
        )}
      </SectionCard>
    </PageSection>
  );
}
function OrderHistory({
  accessToken,
  storeId,
  canEdit,
}: {
  accessToken: string;
  storeId: string;
  canEdit: boolean;
}) {
  const [page, setPage] = useState(1),
    [status, setStatus] = useState("ALL"),
    [search, setSearch] = useState("");
  const [reload, setReload] = useState(0),
    [orders, setOrders] = useState<OrderList | null>(null);
  const [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    void listShoppingOrders(accessToken, storeId, { page, status, search })
      .then((result) => {
        if (current) setOrders(result);
      })
      .catch((caught) => {
        if (current) setError(message(caught));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [accessToken, storeId, page, status, search, reload]);
  return (
    <PageSection>
      <TableContainer
        title="Order history"
        description="Order history and verified payment status. PhonePe payments are test-only; kiosk checkout and collection are not enabled yet."
        actions={
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            Refresh orders
          </Button>
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              {orders?.pagination.total ?? 0} orders · Page {page} of{" "}
              {orders?.pagination.totalPages ?? 1}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page === 1 || loading}
                onClick={() => setPage((n) => n - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={!orders?.pagination.hasMore || loading}
                onClick={() => setPage((n) => n + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Input
            aria-label="Search order reference"
            placeholder="Search order reference"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <SelectMenu
            ariaLabel="Order status"
            value={status}
            options={[
              { value: "ALL", label: "All statuses" },
              { value: "AWAITING_PAYMENT", label: "Awaiting payment" },
              {
                value: "PAYMENT_PENDING",
                label: "Payment confirmation pending",
              },
              { value: "PAID", label: "Paid" },
              { value: "PAID_REVIEW", label: "Paid — staff action needed" },
              { value: "CANCELLED", label: "Cancelled" },
              { value: "EXPIRED", label: "Expired" },
            ]}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5}>Loading orders…</TableCell>
              </TableRow>
            ) : !orders?.data.length ? (
              <TableRow>
                <TableCell colSpan={5}>No orders match this view.</TableCell>
              </TableRow>
            ) : (
              orders.data.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>{order.reference}</TableCell>
                  <TableCell>
                    {new Date(order.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>{statusLabel(order.status)}</TableCell>
                  <TableCell>
                    {shoppingMoney(order.totalCents, order.currency)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      onClick={() => setDetailId(order.id)}
                    >
                      View order
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {detailId && (
        <OrderDetails
          key={detailId}
          accessToken={accessToken}
          storeId={storeId}
          orderId={detailId}
          canEdit={canEdit}
          onClose={() => {
            setDetailId(null);
            setReload((n) => n + 1);
          }}
        />
      )}
    </PageSection>
  );
}
function OrderDetails({
  accessToken,
  storeId,
  orderId,
  canEdit,
  onClose,
}: {
  accessToken: string;
  storeId: string;
  orderId: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<ShoppingOrder | null>(null),
    [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    let current = true;
    setError(null);
    void getShoppingOrder(accessToken, storeId, orderId)
      .then((result) => {
        if (current) setOrder(result);
      })
      .catch((caught) => {
        if (current) setError(message(caught));
      });
    return () => {
      current = false;
    };
  }, [accessToken, storeId, orderId, reload]);
  useEffect(() => {
    if (!order) return;
    const deadline =
      Date.now() +
      new Date(order.expiresAt).getTime() -
      new Date(order.serverTime).getTime();
    const update = () =>
      setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [order]);
  async function cancel() {
    if (!canEdit || busy || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setOrder(
        await cancelShoppingOrder(accessToken, storeId, orderId, reason.trim()),
      );
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  async function paymentAction(attemptId?: string) {
    if (!canEdit || busy) return;
    setBusy(true);
    setError(null);
    try {
      setOrder(
        attemptId
          ? await checkOrderPayment(accessToken, storeId, orderId, attemptId)
          : await recoverOrderStock(accessToken, storeId, orderId),
      );
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  const seconds =
    remaining ??
    (order
      ? Math.max(
          0,
          Math.ceil(
            (new Date(order.expiresAt).getTime() -
              new Date(order.serverTime).getTime()) /
              1000,
          ),
        )
      : 0);
  const active = order?.status === "AWAITING_PAYMENT" && seconds > 0;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>{order?.reference ?? "Order details"}</DialogTitle>
          <DialogDescription>
            Original product, price and tax details captured at checkout.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!order && !error && <p>Loading order…</p>}
        {order && (
          <>
            <p>
              Status:{" "}
              {statusLabel(
                order.status === "AWAITING_PAYMENT" && !active
                  ? "EXPIRED"
                  : order.status,
              )}
            </p>
            {order.status === "PAYMENT_PENDING" && (
              <Alert>
                <AlertDescription>
                  Payment confirmation is still pending
                  {seconds === 0 ? "; the stock hold has expired" : ""}. Refresh
                  or check the payment status. A pending payment is not a failed
                  payment.
                </AlertDescription>
              </Alert>
            )}
            {order.paidAt && (
              <p>
                Payment confirmed: {new Date(order.paidAt).toLocaleString()}
              </p>
            )}
            {order.paymentReviewReason && (
              <Alert>
                <AlertDescription>
                  {[
                    "STOCK_UNAVAILABLE",
                    "STOCK_AND_DUPLICATE_PAYMENT",
                  ].includes(order.paymentReviewReason) &&
                    "Payment succeeded. Stock needs staff attention before fulfillment. Update available stock and retry allocation. "}
                  {[
                    "DUPLICATE_PAYMENT",
                    "STOCK_AND_DUPLICATE_PAYMENT",
                  ].includes(order.paymentReviewReason) &&
                    "More than one payment succeeded for this order. Staff must resolve the extra payment. Stock has not been deducted twice."}
                </AlertDescription>
              </Alert>
            )}
            {canEdit &&
              ["STOCK_UNAVAILABLE", "STOCK_AND_DUPLICATE_PAYMENT"].includes(
                order.paymentReviewReason ?? "",
              ) &&
              !order.stockAllocatedAt && (
                <Button disabled={busy} onClick={() => void paymentAction()}>
                  Retry stock allocation
                </Button>
              )}
            {!!order.paymentAttempts?.length && (
              <div className="space-y-3">
                <h3 className="font-semibold">Payments</h3>
                {order.paymentAttempts.map((attempt) => (
                  <div key={attempt.id} className="space-y-1">
                    <p>
                      {attempt.provider} ·{" "}
                      {attempt.environment === "UAT"
                        ? "Test payment"
                        : attempt.environment}{" "}
                      · {attempt.status} ·{" "}
                      {shoppingMoney(attempt.amountMinor, attempt.currency)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Attempt {attempt.id}
                      {attempt.providerReference
                        ? ` · Reference ${attempt.providerReference}`
                        : ""}
                    </p>
                    {attempt.failureCode && (
                      <p>
                        {attempt.failureCode === "PAYMENT_FAILED"
                          ? "Payment failed."
                          : "Payment status needs verification."}
                      </p>
                    )}
                    {canEdit && attempt.status !== "SUCCEEDED" && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void paymentAction(attempt.id)}
                      >
                        Check payment status
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {active && (
              <p>
                Stock hold remaining: {Math.floor(seconds / 60)}:
                {String(seconds % 60).padStart(2, "0")}
              </p>
            )}
            <div className="overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Options</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit price</TableHead>
                    <TableHead>Tax</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell>
                        {[item.size, item.color].filter(Boolean).join(" / ") ||
                          "Standard"}
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>
                        {shoppingMoney(item.unitPriceCents, order.currency)}
                      </TableCell>
                      <TableCell>
                        {(item.taxRateBasisPoints / 100).toFixed(2)}% ·{" "}
                        {shoppingMoney(item.taxCents, order.currency)}
                      </TableCell>
                      <TableCell>
                        {shoppingMoney(item.totalCents, order.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p>
              Subtotal: {shoppingMoney(order.subtotalCents, order.currency)} ·
              Tax: {shoppingMoney(order.taxCents, order.currency)} · Total:{" "}
              {shoppingMoney(order.totalCents, order.currency)}
            </p>
            {canEdit && active && (
              <div className="space-y-2">
                <Label htmlFor="order-cancel-reason">Cancellation reason</Label>
                <Input
                  id="order-cancel-reason"
                  maxLength={300}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <Button
                  variant="destructive"
                  disabled={busy || !reason.trim()}
                  onClick={() => void cancel()}
                >
                  Cancel unpaid order
                </Button>
              </div>
            )}
          </>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setReload((n) => n + 1)}
          >
            Refresh order
          </Button>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function statusLabel(status: string) {
  return (
    (
      {
        AWAITING_PAYMENT: "Awaiting payment",
        PAYMENT_PENDING: "Payment confirmation pending",
        PAID: "Paid",
        PAID_REVIEW: "Paid — staff action needed",
        CANCELLED: "Cancelled",
        EXPIRED: "Expired",
      } as Record<string, string>
    )[status] ?? status
  );
}
function message(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : "The request could not be completed.";
}
