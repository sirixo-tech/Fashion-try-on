"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SelectMenu,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import { parseTaxRate } from "@/lib/shopping";
import {
  getProductStock,
  updateProductStock,
  stockPriceToCents,
  stockQuantityFromInput,
  type ProductStock,
  type StockOptionMode,
  type StockPricingMode,
} from "@/lib/product-stock";

type StockRow = {
  key: number;
  size: string;
  color: string;
  quantity: string;
  price: string;
};
const emptyRow = (key: number): StockRow => ({
  key,
  size: "",
  color: "",
  quantity: "0",
  price: "",
});

export function ProductStockDialog({
  accessToken,
  storeId,
  product,
  canEdit,
  onClose,
}: {
  accessToken: string;
  storeId: string;
  product: { id: string; name: string };
  canEdit: boolean;
  onClose: () => void;
}) {
  const [stock, setStock] = useState<ProductStock | null>(null);
  const [optionMode, setOptionMode] = useState<StockOptionMode>("SINGLE");
  const [pricingMode, setPricingMode] = useState<StockPricingMode>("CONSTANT");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [reason, setReason] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    setStock(null);
    void getProductStock(accessToken, storeId, product.id)
      .then((next) => {
        if (!current) return;
        setStock(next);
        setTaxRate(
          next.taxRateBasisPoints == null
            ? ""
            : (next.taxRateBasisPoints / 100).toFixed(2),
        );
        setOptionMode(next.optionMode);
        setPricingMode(next.pricingMode);
        setRows(
          next.variants.length
            ? next.variants.map((variant, index) => ({
                key: index,
                size: variant.size ?? "",
                color: variant.color ?? "",
                quantity: String(variant.stockQuantity),
                price:
                  variant.priceOverrideAmountCents === null
                    ? ""
                    : (variant.priceOverrideAmountCents / 100).toFixed(2),
              }))
            : [emptyRow(0)],
        );
        setReason(next.configured ? "" : "Initial stock setup");
        setConflict(false);
        setSaved(false);
      })
      .catch((caught: unknown) => {
        if (current) setError(messageFor(caught));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [accessToken, storeId, product.id, reload]);

  const hasSize = optionMode === "SIZE" || optionMode === "SIZE_COLOR";
  const hasColor = optionMode === "COLOR" || optionMode === "SIZE_COLOR";
  function changeRow(key: number, patch: Partial<StockRow>) {
    setSaved(false);
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }
  async function save() {
    if (!stock || !canEdit || saving || conflict) return;
    setError(null);
    setSaved(false);
    try {
      if (!reason.trim())
        throw new Error("Enter a reason for this stock change.");
      if (optionMode === "SINGLE" && rows.length !== 1)
        throw new Error(
          "Remove extra rows before using a single stock quantity.",
        );
      const variants = rows.map((row) => {
        if ((hasSize && !row.size.trim()) || (hasColor && !row.color.trim()))
          throw new Error(
            "Enter the size and colour required for every option.",
          );
        return {
          size: hasSize ? row.size.trim() : null,
          color: hasColor ? row.color.trim() : null,
          stockQuantity: stockQuantityFromInput(row.quantity),
          priceOverrideAmountCents:
            pricingMode === "VARIANT" ? stockPriceToCents(row.price) : null,
        };
      });
      setSaving(true);
      const next = await updateProductStock(accessToken, storeId, product.id, {
        taxRateBasisPoints: parseTaxRate(taxRate),
        expectedVersion: stock.version,
        optionMode,
        pricingMode,
        reason: reason.trim(),
        variants,
      });
      setStock(next);
      setRows(
        next.variants.map((variant, index) => ({
          key: index,
          size: variant.size ?? "",
          color: variant.color ?? "",
          quantity: String(variant.stockQuantity),
          price:
            variant.priceOverrideAmountCents === null
              ? ""
              : (variant.priceOverrideAmountCents / 100).toFixed(2),
        })),
      );
      setReason("");
      setSaved(true);
    } catch (caught) {
      setError(messageFor(caught));
      if (
        caught instanceof SafeApiError &&
        caught.code === "PRODUCT_STOCK_VERSION_CONFLICT"
      )
        setConflict(true);
    } finally {
      setSaving(false);
    }
  }

  const priceLabel =
    stock?.basePriceAmountCents == null
      ? "Not set"
      : `${stock.priceCurrency ?? ""} ${(stock.basePriceAmountCents / 100).toFixed(2)}`;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
        showCloseButton={!saving}
      >
        <DialogHeader>
          <DialogTitle>Stock &amp; Pricing — {product.name}</DialogTitle>
          <DialogDescription>
            All kiosks in this Store share these quantities. Zero-stock products
            remain available for Try-On.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {loading ? (
          <p role="status">Loading stock…</p>
        ) : !stock ? (
          <Button
            variant="outline"
            onClick={() => setReload((value) => value + 1)}
          >
            Retry
          </Button>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Product price: {priceLabel}. Change the base price and currency in
              Edit Product.{" "}
              {!stock.configured &&
                "Stock has not been configured yet; saving starts stock tracking."}
            </p>
            {stock.basePriceAmountCents === null && (
              <p className="text-sm text-muted-foreground">
                Stock can be configured without a price. A valid price will be
                required before purchasing is enabled.
              </p>
            )}
            <fieldset
              disabled={!canEdit || saving || conflict}
              className="min-w-0 space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Product options</Label>
                  <SelectMenu
                    ariaLabel="Product options"
                    value={optionMode}
                    options={[
                      { value: "SINGLE", label: "No size or colour" },
                      { value: "SIZE", label: "Sizes only" },
                      { value: "COLOR", label: "Colours only" },
                      { value: "SIZE_COLOR", label: "Sizes and colours" },
                    ]}
                    disabled={!canEdit || saving || conflict}
                    onChange={(value) => {
                      setOptionMode(value);
                      setSaved(false);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pricing</Label>
                  <SelectMenu
                    ariaLabel="Pricing"
                    value={pricingMode}
                    options={[
                      {
                        value: "CONSTANT",
                        label: "Same product price for every option",
                      },
                      { value: "VARIANT", label: "Allow variant prices" },
                    ]}
                    disabled={!canEdit || saving || conflict}
                    onChange={(value) => {
                      setPricingMode(value);
                      setSaved(false);
                    }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-tax-rate">
                  Product tax rate override (%)
                </Label>
                <Input
                  id="product-tax-rate"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  placeholder="Use Store default"
                  value={taxRate}
                  onChange={(event) => {
                    setTaxRate(event.target.value);
                    setSaved(false);
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  Blank uses the Store default; 0 makes this product tax-free.
                  The Store chooses whether tax is included, added or switched
                  off.
                </p>
              </div>
              {stock.totalReservedStockQuantity !== undefined && (
                <p className="text-sm">
                  On hand: {stock.totalStockQuantity} · Reserved:{" "}
                  {stock.totalReservedStockQuantity} · Available:{" "}
                  {stock.totalAvailableStockQuantity}
                </p>
              )}
              {pricingMode === "VARIANT" && (
                <p className="text-sm text-muted-foreground">
                  Leave a variant price blank to use the product price. All
                  prices use {stock.priceCurrency ?? "the product currency"}.
                </p>
              )}
              <div className="overflow-x-auto">
                <Table
                  className={
                    hasSize || hasColor ? "min-w-[640px]" : "min-w-[420px]"
                  }
                >
                  <TableHeader>
                    <TableRow>
                      {hasSize && <TableHead>Size</TableHead>}
                      {hasColor && <TableHead>Colour</TableHead>}
                      {!hasSize && !hasColor && <TableHead>Option</TableHead>}
                      <TableHead>Stock quantity</TableHead>
                      {pricingMode === "VARIANT" && (
                        <TableHead>Variant price</TableHead>
                      )}
                      <TableHead>Availability</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, index) => (
                      <TableRow key={row.key}>
                        {hasSize && (
                          <TableCell>
                            <Input
                              aria-label={`Size ${index + 1}`}
                              maxLength={80}
                              value={row.size}
                              onChange={(event) =>
                                changeRow(row.key, { size: event.target.value })
                              }
                            />
                          </TableCell>
                        )}
                        {hasColor && (
                          <TableCell>
                            <Input
                              aria-label={`Colour ${index + 1}`}
                              maxLength={80}
                              value={row.color}
                              onChange={(event) =>
                                changeRow(row.key, {
                                  color: event.target.value,
                                })
                              }
                            />
                          </TableCell>
                        )}
                        {!hasSize && !hasColor && (
                          <TableCell>Standard</TableCell>
                        )}
                        <TableCell>
                          <Input
                            aria-label={`Stock quantity ${index + 1}`}
                            type="number"
                            min={0}
                            max={1000000}
                            step={1}
                            value={row.quantity}
                            onChange={(event) =>
                              changeRow(row.key, {
                                quantity: event.target.value,
                              })
                            }
                          />
                        </TableCell>
                        {pricingMode === "VARIANT" && (
                          <TableCell>
                            <Input
                              aria-label={`Variant price ${index + 1}`}
                              type="number"
                              min={0}
                              max={1000000}
                              step="0.01"
                              placeholder="Product price"
                              value={row.price}
                              onChange={(event) =>
                                changeRow(row.key, {
                                  price: event.target.value,
                                })
                              }
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          {/^\d+$/.test(row.quantity)
                            ? Number(row.quantity) === 0
                              ? "Out of stock"
                              : "In stock"
                            : "Check quantity"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`Remove option ${index + 1}`}
                            disabled={rows.length <= 1}
                            onClick={() => {
                              setRows((current) =>
                                current.filter((item) => item.key !== row.key),
                              );
                              setSaved(false);
                            }}
                          >
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {optionMode !== "SINGLE" && (
                <Button
                  variant="outline"
                  disabled={rows.length >= 100}
                  onClick={() => {
                    setRows((current) => [
                      ...current,
                      emptyRow(
                        Math.max(-1, ...current.map((row) => row.key)) + 1,
                      ),
                    ]);
                    setSaved(false);
                  }}
                >
                  Add option
                </Button>
              )}
              <div className="space-y-2">
                <Label htmlFor="stock-change-reason">Reason for change</Label>
                <Input
                  id="stock-change-reason"
                  maxLength={300}
                  value={reason}
                  placeholder="For example: delivery received or stock count correction"
                  onChange={(event) => {
                    setReason(event.target.value);
                    setSaved(false);
                  }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Saving replaces the listed quantities. Removed options are
                archived. Switching to constant pricing clears saved variant
                price overrides.
              </p>
            </fieldset>
            {saved && (
              <p role="status">
                Stock and pricing saved. Total stock: {stock.totalStockQuantity}
                .
              </p>
            )}
            {conflict && (
              <Button
                variant="outline"
                onClick={() => setReload((value) => value + 1)}
              >
                Discard edits and reload latest stock
              </Button>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Close
          </Button>
          {stock && canEdit && (
            <Button
              disabled={loading || saving || conflict}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save stock & pricing"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function messageFor(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : "Could not load or save stock. Please try again.";
}
