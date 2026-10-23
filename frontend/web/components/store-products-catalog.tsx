"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CircleOffIcon,
  CloudDownloadIcon,
  Edit3Icon,
  ImageIcon,
  PackageIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  PageContainer,
  PageHeader,
  PageSection,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@selfx/ui";

import {
  garmentCategoryForProductType,
  garmentIntentForProductType,
  jewelleryCategoryNameForType,
  normalizedJewelleryTypeFor,
  normalizedProductTypeFor,
  productGarmentTypes,
  productJewelleryTypes,
  productVerticals,
  ProductSelectMenu,
  ProductStatusToggle,
} from "@/components/product-form-controls";
import { SafeApiError } from "@/lib/api";
import { ProductStockDialog } from "@/components/product-stock-dialog";
import { useSession } from "@/lib/session";
import { hasStoreResourcePermission } from "@/lib/current-store";
import {
  deleteStoreProduct,
  getEffectiveStorePermissions,
  getStore,
  listStoreProducts,
  requestStoreCatalogSync,
  setImportedProductsVtoEnabled,
  updateStoreProduct,
  type AdminStoreDetail,
  type BulkImportedProductVtoResponse,
  type JewelleryType,
  type ProductVertical,
  type StoreProduct,
  type StoreProductInput,
} from "@/lib/stores";

const productStatuses = [
  { value: "ALL", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
] as const;

type ProductStatus = (typeof productStatuses)[number]["value"];

export function StoreProductsCatalog({
  storeId,
  defaultVertical = "GARMENT",
  merchantWorkspace = false,
}: {
  storeId: string;
  defaultVertical?: ProductVertical;
  merchantWorkspace?: boolean;
}) {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [store, setStore] = useState<AdminStoreDetail | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProductStatus>("ALL");
  const [productVertical, setProductVertical] =
    useState<ProductVertical>(defaultVertical);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
    hasMore: false,
  });
  const [canUpdateProducts, setCanUpdateProducts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [bulkVtoAction, setBulkVtoAction] = useState<boolean | null>(null);
  const [bulkVtoBusy, setBulkVtoBusy] = useState(false);
  const [stockProduct, setStockProduct] = useState<StoreProduct | null>(null);
  const [deleting, setDeleting] = useState<StoreProduct | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [updatingProductId, setUpdatingProductId] = useState<string | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextStore, nextPermissions, nextProducts] = await Promise.all([
        getStore(accessToken, storeId),
        getEffectiveStorePermissions(accessToken, storeId),
        listStoreProducts(accessToken, storeId, {
          page,
          pageSize: 25,
          search,
          status,
          productVertical,
        }),
      ]);
      setStore(nextStore);
      setProducts(nextProducts.data);
      setPagination(nextProducts.pagination);
      setCanUpdateProducts(
        hasStoreResourcePermission(nextPermissions, "products.manage"),
      );
    } catch (caught) {
      setCanUpdateProducts(false);
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, page, productVertical, search, status, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canUpdateProducts) {
      setDeleting(null);
      setBulkVtoAction(null);
    }
  }, [canUpdateProducts]);

  const activeCount = useMemo(
    () => products.filter((product) => product.active).length,
    [products],
  );
  const verticalLabel =
    productVertical === "JEWELLERY" ? "Jewellery" : "Garments";
  const verticalItemLabel =
    productVertical === "JEWELLERY" ? "jewellery items" : "garments";
  const productBase = merchantWorkspace
    ? `/app/products/${productVertical === "JEWELLERY" ? "jewellery" : "garments"}`
    : `/app/stores/${storeId}/products`;

  function revokeProductAccess() {
    setCanUpdateProducts(false);
    setError(
      "Product editing is no longer permitted. Refresh to check your access.",
    );
  }

  function mutationFailed(caught: unknown) {
    if (caught instanceof SafeApiError && caught.status === 403)
      revokeProductAccess();
    else setError(messageFor(caught));
  }

  async function confirmDeleteProduct() {
    if (!accessToken || !canUpdateProducts || !deleting) {
      return;
    }
    setDeleteBusy(true);
    setError(null);
    try {
      await deleteStoreProduct(accessToken, storeId, deleting.id);
      setDeleting(null);
      await load();
    } catch (caught) {
      mutationFailed(caught);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function updateProductInline(
    product: StoreProduct,
    overrides: ProductInlineOverrides,
  ) {
    if (!accessToken || !canUpdateProducts || updatingProductId) {
      return;
    }
    setUpdatingProductId(product.id);
    setError(null);
    try {
      const updated = await updateStoreProduct(
        accessToken,
        storeId,
        product.id,
        isImported(product)
          ? importedProductInput(product, overrides)
          : productInputFromProduct(product, overrides),
      );
      setProducts((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (caught) {
      mutationFailed(caught);
    } finally {
      setUpdatingProductId(null);
    }
  }

  async function syncCatalogToKiosks() {
    if (!accessToken || !canUpdateProducts || syncBusy) {
      return;
    }
    setSyncBusy(true);
    setError(null);
    setSyncMessage(null);
    try {
      const result = await requestStoreCatalogSync(
        accessToken,
        storeId,
        productVertical,
      );
      setSyncMessage(catalogSyncMessage(result.updatedDevices));
    } catch (caught) {
      mutationFailed(caught);
    } finally {
      setSyncBusy(false);
    }
  }

  async function applyImportedVtoChange() {
    if (
      !accessToken ||
      !canUpdateProducts ||
      bulkVtoAction === null ||
      bulkVtoBusy
    ) {
      return;
    }
    setBulkVtoBusy(true);
    setError(null);
    setSyncMessage(null);
    try {
      const result = await setImportedProductsVtoEnabled(accessToken, storeId, {
        enabled: bulkVtoAction,
        productVertical,
      });
      setSyncMessage(importedVtoMessage(result));
      setBulkVtoAction(null);
      await load();
    } catch (caught) {
      mutationFailed(caught);
    } finally {
      setBulkVtoBusy(false);
    }
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Store Catalog"
        title="Products"
        description={
          store
            ? `${store.name} garment and jewellery catalog products for kiosk Try-On.`
            : "Store garment and jewellery catalog products for kiosk Try-On."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              render={
                <Link
                  href={
                    merchantWorkspace
                      ? "/app/dashboard"
                      : `/app/stores/${storeId}`
                  }
                />
              }
              variant="outline"
            >
              <ArrowLeftIcon aria-hidden="true" />
              {merchantWorkspace ? "Dashboard" : "Store"}
            </Button>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            {canUpdateProducts && (
              <>
                <Button
                  variant="outline"
                  disabled={syncBusy}
                  onClick={() => void syncCatalogToKiosks()}
                >
                  <CloudDownloadIcon aria-hidden="true" />
                  {syncBusy ? "Syncing..." : "Sync to Kiosks"}
                </Button>
                <Button
                  variant="outline"
                  disabled={bulkVtoBusy}
                  onClick={() => setBulkVtoAction(true)}
                >
                  <CheckCircleIcon aria-hidden="true" />
                  Enable Imported
                </Button>
                <Button
                  variant="outline"
                  disabled={bulkVtoBusy}
                  onClick={() => setBulkVtoAction(false)}
                >
                  <CircleOffIcon aria-hidden="true" />
                  Disable Imported
                </Button>
                <Button
                  render={
                    <Link
                      href={`${productBase}/new?vertical=${productVertical}`}
                    />
                  }
                >
                  <PlusIcon aria-hidden="true" />
                  Add{" "}
                  {productVertical === "JEWELLERY" ? "Jewellery" : "Garment"}
                </Button>
              </>
            )}
          </div>
        }
        status={
          <StatusBadge
            status="ACTIVE"
            label={`${activeCount} active ${verticalItemLabel}`}
          />
        }
      />

      {error ? (
        <PageSection>
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <ShieldAlertIcon size={18} aria-hidden="true" />
            {error}
          </div>
        </PageSection>
      ) : null}

      {syncMessage ? (
        <PageSection>
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            <CheckCircleIcon size={18} aria-hidden="true" />
            {syncMessage}
          </div>
        </PageSection>
      ) : null}

      <PageSection>
        <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)_12rem]">
          <div className="flex rounded-lg border bg-background p-1">
            {productVerticals.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={productVertical === option.value ? "default" : "ghost"}
                size="sm"
                onClick={() => {
                  setPage(1);
                  setProductVertical(option.value);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <label className="relative block">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              value={search}
              placeholder={`Search ${verticalItemLabel}...`}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
            />
          </label>
          <ProductSelectMenu
            ariaLabel="Filter products by status"
            value={status}
            options={productStatuses}
            onChange={(value) => {
              setPage(1);
              setStatus(value);
            }}
          />
        </div>
      </PageSection>

      <PageSection>
        <TableContainer
          title={`Store ${verticalLabel}`}
          description={
            productVertical === "JEWELLERY"
              ? "Manage jewellery products and their ornament types for SelfX Try-On."
              : "Garments shown here are the Store catalog used by assigned kiosks."
          }
          footer={
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {pagination.total} {verticalItemLabel}, page {pagination.page}{" "}
                of {pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasMore}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>
                  {productVertical === "JEWELLERY"
                    ? "Jewellery Type"
                    : "Garment Type"}
                </TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Try-On</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6}>Loading products...</TableCell>
                </TableRow>
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="flex items-center gap-3 py-10 text-muted-foreground">
                      <PackageIcon size={20} aria-hidden="true" />
                      No {verticalItemLabel} match this view.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <ProductThumb product={product} />
                        <div className="min-w-0">
                          <div className="font-semibold">{product.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {product.catalogSource === "SHOPIFY"
                              ? "Shopify"
                              : product.catalogSource === "WOOCOMMERCE"
                                ? "WooCommerce"
                                : "SelfX"}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {product.description || product.slug}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-40 max-w-52">
                        {!canUpdateProducts ? (
                          <span>
                            {product.productVertical === "JEWELLERY"
                              ? productJewelleryTypes.find(
                                  (type) =>
                                    type.value ===
                                    normalizedJewelleryTypeFor(
                                      product.jewelleryType,
                                    ),
                                )?.label
                              : normalizedProductTypeFor(
                                  product.categoryName,
                                  product.garmentIntent,
                                )}
                          </span>
                        ) : product.productVertical === "JEWELLERY" ? (
                          <ProductSelectMenu
                            ariaLabel={`Change jewellery type for ${product.name}`}
                            value={normalizedJewelleryTypeFor(
                              product.jewelleryType,
                            )}
                            options={productJewelleryTypes}
                            disabled={updatingProductId === product.id}
                            onChange={(value) =>
                              void updateProductInline(product, {
                                jewelleryType: value,
                              })
                            }
                          />
                        ) : (
                          <ProductSelectMenu
                            ariaLabel={`Change garment type for ${product.name}`}
                            value={normalizedProductTypeFor(
                              product.categoryName,
                              product.garmentIntent,
                            )}
                            options={productGarmentTypes}
                            disabled={updatingProductId === product.id}
                            onChange={(value) =>
                              void updateProductInline(product, {
                                categoryName: value,
                              })
                            }
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {isImported(product)
                        ? "Managed on website"
                        : formatPrice(product)}
                    </TableCell>
                    <TableCell>
                      {canUpdateProducts && !isImported(product) ? (
                        <ProductStatusToggle
                          active={product.active}
                          disabled={updatingProductId === product.id}
                          onChange={(active) =>
                            void updateProductInline(product, { active })
                          }
                        />
                      ) : (
                        <StatusBadge
                          status={product.active ? "ACTIVE" : "INACTIVE"}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={product.vtoEnabled ? "ACTIVE" : "INACTIVE"}
                        label={product.vtoEnabled ? "Enabled" : "Disabled"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {isImported(product) ? (
                          <>
                            {canUpdateProducts ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={updatingProductId === product.id}
                                onClick={() =>
                                  void updateProductInline(product, {
                                    vtoEnabled: !product.vtoEnabled,
                                  })
                                }
                              >
                                {product.vtoEnabled
                                  ? "Disable Try-On"
                                  : "Enable Try-On"}
                              </Button>
                            ) : null}
                            {product.productUrl &&
                            /^https?:\/\//i.test(product.productUrl) ? (
                              <a
                                className="self-center text-sm underline"
                                href={product.productUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Original product
                              </a>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              render={
                                canUpdateProducts ? (
                                  <Link
                                    href={`${productBase}/${product.id}/edit#pricing`}
                                  />
                                ) : undefined
                              }
                              onClick={
                                canUpdateProducts
                                  ? undefined
                                  : () => setStockProduct(product)
                              }
                            >
                              <PackageIcon aria-hidden="true" />
                              {canUpdateProducts
                                ? "Stock & Pricing"
                                : "View Stock & Pricing"}
                            </Button>
                            {canUpdateProducts && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  render={
                                    <Link
                                      href={`${productBase}/${product.id}/edit`}
                                    />
                                  }
                                >
                                  <Edit3Icon aria-hidden="true" />
                                  Edit
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  aria-label={`Delete ${product.name}`}
                                  onClick={() => setDeleting(product)}
                                >
                                  <Trash2Icon aria-hidden="true" />
                                  Delete
                                </Button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </PageSection>

      {stockProduct && accessToken && (
        <ProductStockDialog
          key={stockProduct.id}
          accessToken={accessToken}
          storeId={storeId}
          product={stockProduct}
          canEdit={canUpdateProducts}
          onPermissionDenied={revokeProductAccess}
          onClose={() => setStockProduct(null)}
        />
      )}
      <DeleteProductDialog
        product={canUpdateProducts ? deleting : null}
        deleting={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDeleteProduct()}
      />
      <BulkImportedVtoDialog
        enabled={canUpdateProducts ? bulkVtoAction : null}
        busy={bulkVtoBusy}
        verticalLabel={verticalLabel}
        onCancel={() => setBulkVtoAction(null)}
        onConfirm={() => void applyImportedVtoChange()}
      />
    </PageContainer>
  );
}

function BulkImportedVtoDialog({
  enabled,
  busy,
  verticalLabel,
  onCancel,
  onConfirm,
}: {
  enabled: boolean | null;
  busy: boolean;
  verticalLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const enabling = enabled === true;
  return (
    <Dialog
      open={enabled !== null}
      onOpenChange={(open) => !open && onCancel()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {enabling
              ? "Enable imported products for Try-On?"
              : "Disable imported products for Try-On?"}
          </DialogTitle>
          <DialogDescription>
            {enabling
              ? "Active imported products with an image will become available for Try-On."
              : "Imported products in this catalog will no longer be available for Try-On."}{" "}
            {verticalLabel} on the connected website will not be changed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={enabling ? "default" : "destructive"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy
              ? "Updating..."
              : enabling
                ? "Enable Try-On"
                : "Disable Try-On"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteProductDialog({
  product,
  deleting,
  onCancel,
  onConfirm,
}: {
  product: StoreProduct | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={product !== null}
      onOpenChange={(open) => !open && onCancel()}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Product</DialogTitle>
          <DialogDescription>
            {product
              ? `Delete ${product.name} from this Store catalog? This removes it from assigned kiosk catalog browsing.`
              : "Delete this product?"}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={deleting} onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={deleting} onClick={onConfirm}>
            <Trash2Icon aria-hidden="true" />
            Delete Product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductThumb({ product }: { product: StoreProduct }) {
  return (
    <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted/30">
      {product.image.url ? (
        <Image
          src={product.image.url}
          alt=""
          width={56}
          height={56}
          unoptimized
          className="h-full w-full object-contain"
        />
      ) : (
        <ImageIcon size={20} aria-hidden="true" />
      )}
    </div>
  );
}

type ProductInlineOverrides = Partial<
  Pick<StoreProductInput, "active" | "vtoEnabled">
> & {
  categoryName?: string;
  jewelleryType?: JewelleryType | null;
};

function productInputFromProduct(
  product: StoreProduct,
  overrides: ProductInlineOverrides,
): StoreProductInput {
  const base = {
    name: product.name,
    description: product.description,
    audience: product.audience,
    priceAmountCents: product.priceAmountCents,
    priceCurrency: product.priceCurrency,
    productUrl: product.productUrl,
    active: overrides.active ?? product.active,
    vtoEnabled: overrides.vtoEnabled ?? product.vtoEnabled,
  };

  if (product.productVertical === "JEWELLERY") {
    const jewelleryType = normalizedJewelleryTypeFor(
      overrides.jewelleryType ?? product.jewelleryType,
    );
    return {
      ...base,
      categoryName: jewelleryCategoryNameForType(jewelleryType),
      productVertical: "JEWELLERY",
      jewelleryType,
    };
  }

  const categoryName =
    overrides.categoryName ??
    normalizedProductTypeFor(product.categoryName, product.garmentIntent);
  return {
    ...base,
    categoryName,
    productVertical: "GARMENT",
    jewelleryType: null,
    garmentIntent: garmentIntentForProductType(categoryName),
    garmentCategory: garmentCategoryForProductType(categoryName),
    garmentPhotoType: product.garmentPhotoType || "AUTO",
  };
}

function formatPrice(product: StoreProduct): string {
  if (product.priceAmountCents === null || !product.priceCurrency) {
    return "-";
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: product.priceCurrency,
  }).format(product.priceAmountCents / 100);
}

function catalogSyncMessage(updatedDevices: number): string {
  if (updatedDevices === 0) {
    return "This Store has no active kiosks to update.";
  }
  return `Sync requested for ${updatedDevices} active kiosk${updatedDevices === 1 ? "" : "s"}. Online kiosks update on their next heartbeat; offline kiosks update after reconnecting.`;
}

function importedProductInput(
  product: StoreProduct,
  overrides: ProductInlineOverrides,
): Partial<StoreProductInput> {
  if (overrides.vtoEnabled !== undefined)
    return { vtoEnabled: overrides.vtoEnabled };
  const input = productInputFromProduct(product, overrides);
  return {
    categoryName: input.categoryName,
    productVertical: input.productVertical,
    jewelleryType: input.jewelleryType,
    garmentIntent: input.garmentIntent,
    garmentCategory: input.garmentCategory,
    garmentPhotoType: input.garmentPhotoType,
  };
}
function isImported(product: StoreProduct): boolean {
  return (
    product.catalogSource === "SHOPIFY" ||
    product.catalogSource === "WOOCOMMERCE"
  );
}
function importedVtoMessage(result: BulkImportedProductVtoResponse): string {
  const action = result.enabled ? "enabled" : "disabled";
  const messages = [
    result.updatedProducts +
      " imported product" +
      (result.updatedProducts === 1 ? "" : "s") +
      " " +
      action +
      " for Try-On.",
  ];
  if (
    result.enabled &&
    result.eligibleProducts < result.matchedImportedProducts
  ) {
    const skipped = result.matchedImportedProducts - result.eligibleProducts;
    messages.push(
      skipped +
        " inactive or imageless product" +
        (skipped === 1 ? " was" : "s were") +
        " skipped.",
    );
  }
  if (result.updatedDevices > 0) {
    messages.push(
      result.updatedDevices +
        " active kiosk" +
        (result.updatedDevices === 1 ? " was" : "s were") +
        " notified.",
    );
  }
  return messages.join(" ");
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  if (caught instanceof Error) {
    return caught.message;
  }
  return "The product request could not be completed.";
}
