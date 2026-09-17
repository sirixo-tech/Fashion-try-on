"use client";

import { useEffect, useMemo, useState } from "react";
import { GemIcon, PackageIcon, RefreshCwIcon } from "lucide-react";
import {
  Alert,
  AlertDescription,
  Button,
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

import { getUsageSummary, type UsageSummary } from "@/lib/usage";

type OverviewRange = "7d" | "30d" | "billing";

export function StoreTryOnUsage({
  accessToken,
  storeId,
  currentPeriodStart,
  currentPeriodEnd,
}: {
  accessToken: string;
  storeId: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
}) {
  const [range, setRange] = useState<OverviewRange>("30d");
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const billingCycle = useMemo(() => {
    const start = Date.parse(currentPeriodStart ?? "");
    const end = Date.parse(currentPeriodEnd ?? "");
    const now = Date.now();
    return Number.isFinite(start) &&
      Number.isFinite(end) &&
      start < now &&
      end > now
      ? { from: new Date(start).toISOString(), to: new Date(now).toISOString() }
      : null;
  }, [currentPeriodStart, currentPeriodEnd, reload]);
  const selectedRange = range === "billing" && !billingCycle ? "30d" : range;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setSummary(null);
    getUsageSummary(accessToken, {
      storeId,
      limit: 5,
      range: selectedRange === "billing" ? "custom" : selectedRange,
      ...(selectedRange === "billing" ? billingCycle : {}),
    })
      .then((next) => {
        if (cancelled) return;
        if (next.scope.mode !== "STORE" || next.scope.storeId !== storeId) {
          setError(true);
          return;
        }
        setSummary(next);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, storeId, selectedRange, billingCycle, reload]);

  const products = (summary?.products ?? [])
    .filter((row) => row.completedRuns > 0)
    .slice(0, 5);
  const categories = (summary?.categories ?? [])
    .filter((row) => row.completedRuns > 0)
    .slice(0, 5);

  return (
    <PageSection>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Try-On Usage</h2>
          {summary ? (
            <p className="text-sm text-muted-foreground">
              {formatDate(summary.range.from)} to {formatDate(summary.range.to)}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <SelectMenu<OverviewRange>
            ariaLabel="Try-On usage date range"
            value={selectedRange}
            onChange={setRange}
            options={[
              { value: "7d", label: "Last 7 days" },
              { value: "30d", label: "Last 30 days" },
              ...(billingCycle
                ? [
                    {
                      value: "billing" as const,
                      label: "Current billing cycle",
                    },
                  ]
                : []),
            ]}
            className="h-9 w-[190px]"
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh Try-On usage"
            title="Refresh Try-On usage"
            disabled={loading}
            onClick={() => setReload((value) => value + 1)}
          >
            <RefreshCwIcon size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>Store usage could not be loaded.</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReload((value) => value + 1)}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2" aria-busy={loading}>
          <TableContainer title="Most-used products">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Try-Ons</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading || !products.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="py-6 text-center text-muted-foreground"
                    >
                      {loading
                        ? "Loading products..."
                        : "No completed product Try-Ons in this period."}
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((row) => (
                    <TableRow
                      key={
                        row.productId ??
                        `${row.catalogSource}:${row.externalProductId ?? row.sku ?? row.name}`
                      }
                    >
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          <ProductThumbnail
                            url={row.thumbnailUrl}
                            jewellery={row.productVertical === "JEWELLERY"}
                          />
                          <div className="min-w-0">
                            <div className="break-words font-medium">
                              {row.name}
                            </div>
                            <div className="break-words text-xs text-muted-foreground">
                              {row.category ?? "Uncategorized"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.productVertical === "JEWELLERY"
                          ? "Jewellery"
                          : row.productVertical === "GARMENT"
                            ? "Garment"
                            : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.completedRuns.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TableContainer title="Most-used categories">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Try-Ons</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading || !categories.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      className="py-6 text-center text-muted-foreground"
                    >
                      {loading
                        ? "Loading categories..."
                        : "No completed category Try-Ons in this period."}
                    </TableCell>
                  </TableRow>
                ) : (
                  categories.map((row) => (
                    <TableRow key={row.category}>
                      <TableCell className="break-words font-medium">
                        {row.category}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.completedRuns.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      )}
    </PageSection>
  );
}

function ProductThumbnail({
  url,
  jewellery,
}: {
  url?: string | null;
  jewellery: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const Icon = jewellery ? GemIcon : PackageIcon;
  return (
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
      {url && url !== failedUrl ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          className="size-full object-contain"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <Icon size={18} className="text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
