"use client";

import { useState } from "react";
import { Button, Input, Label } from "@selfx/ui";
import {
  quoteStoreCustomCredits,
  type StoreCustomCreditQuote,
} from "@/lib/custom-credit-plans";

export function StoreCustomCreditQuoteCard({
  accessToken,
  storeId,
}: {
  accessToken: string;
  storeId: string;
}) {
  const [quantity, setQuantity] = useState("10");
  const [quote, setQuote] = useState<StoreCustomCreditQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadQuote() {
    const count = Number(quantity);
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      setError("Choose 1 to 1,000 credits.");
      setQuote(null);
      return;
    }
    setLoading(true);
    setError(null);
    setQuote(null);
    try {
      setQuote(await quoteStoreCustomCredits(accessToken, storeId, count));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Quote unavailable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <h2 className="text-lg font-semibold">Custom credits</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Get a quote for the number of Store credits you need. Online purchase is
        not enabled yet.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Label htmlFor="store-custom-credit-quantity">Credits</Label>
          <Input
            id="store-custom-credit-quantity"
            type="number"
            min={1}
            max={1000}
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value);
              setQuote(null);
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadQuote()}
          disabled={loading}
        >
          {loading ? "Getting quote…" : "Get quote"}
        </Button>
      </div>
      {quote && (
        <p role="status" className="mt-4 text-sm">
          {quote.quantity.toLocaleString()} credits ×{" "}
          {new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: quote.currency,
          }).format(quote.unitPriceCents / 100)}{" "}
          =
          <strong className="ml-1">
            {new Intl.NumberFormat(undefined, {
              style: "currency",
              currency: quote.currency,
            }).format(quote.totalMinor / 100)}
          </strong>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
