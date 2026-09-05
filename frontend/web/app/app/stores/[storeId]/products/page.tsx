"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CloudDownloadIcon,
  Edit3Icon,
  ImageIcon,
  PackageIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldAlertIcon,
  Trash2Icon,
  UploadIcon,
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
  Textarea,
} from "@selfx/ui";

import {
  assertJewelleryProductImageDimensions,
  currencySymbolFor,
  garmentCategoryForProductType,
  garmentIntentForProductType,
  jewelleryCategoryNameForType,
  normalizedJewelleryTypeFor,
  normalizedProductTypeFor,
  productAudiences,
  productGarmentTypes,
  productJewelleryTypes,
  productVerticals,
  ProductSelectMenu,
  ProductStatusToggle,
  ProductToggleCheckbox,
} from "@/components/product-form-controls";
import { SafeApiError } from "@/lib/api";
import { readImageDimensions } from "@/lib/image-dimensions";
import { getPlatformVirtualTryOnSettings } from "@/lib/platform-settings";
import { useSession } from "@/lib/session";
import {
  createStoreProduct,
  createStoreProductImageUploadIntent,
  deleteStoreProduct,
  getEffectiveStorePermissions,
  getStore,
  listStoreProducts,
  requestStoreCatalogSync,
  updateStoreProduct,
  type AdminStoreDetail,
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

export default function StoreProductsPage() {
  const params = useParams<{ storeId: string }>();
  const storeId = params.storeId;
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [store, setStore] = useState<AdminStoreDetail | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProductStatus>("ALL");
  const [productVertical, setProductVertical] =
    useState<ProductVertical>("GARMENT");
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
  const [editing, setEditing] = useState<StoreProduct | null>(null);
  const [deleting, setDeleting] = useState<StoreProduct | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
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
      const [settings, nextStore, nextPermissions, nextProducts] =
        await Promise.all([
          getPlatformVirtualTryOnSettings(accessToken),
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
      setDefaultCurrency(settings.defaultCurrency);
      setStore(nextStore);
      setProducts(nextProducts.data);
      setPagination(nextProducts.pagination);
      setCanUpdateProducts(
        nextPermissions.platformBypass ||
          nextPermissions.permissions.includes("stores.update"),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, page, productVertical, search, status, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = useMemo(
    () => products.filter((product) => product.active).length,
    [products],
  );
  const verticalLabel =
    productVertical === "JEWELLERY" ? "Jewellery" : "Garments";
  const verticalItemLabel =
    productVertical === "JEWELLERY" ? "jewellery items" : "garments";

  async function confirmDeleteProduct() {
    if (!accessToken || !deleting) {
      return;
    }
    setDeleteBusy(true);
    setError(null);
    try {
      await deleteStoreProduct(accessToken, storeId, deleting.id);
      setDeleting(null);
      await load();
    } catch (caught) {
      setError(messageFor(caught));
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
        productInputFromProduct(product, overrides),
      );
      setProducts((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (caught) {
      setError(messageFor(caught));
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
      setError(messageFor(caught));
    } finally {
      setSyncBusy(false);
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
              render={<Link href={`/app/stores/${storeId}`} />}
              variant="outline"
            >
              <ArrowLeftIcon aria-hidden="true" />
              Store
            </Button>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            <Button
              variant="outline"
              disabled={!canUpdateProducts || syncBusy}
              onClick={() => void syncCatalogToKiosks()}
            >
              <CloudDownloadIcon aria-hidden="true" />
              {syncBusy ? "Syncing..." : "Sync to Kiosks"}
            </Button>
            <Button
              disabled={!canUpdateProducts}
              onClick={() => setCreating(true)}
            >
              <PlusIcon aria-hidden="true" />
              Add {productVertical === "JEWELLERY" ? "Jewellery" : "Garment"}
            </Button>
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
              ? "Jewellery products are kept separate because their type drives ornament Try-On provider routing."
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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5}>Loading products...</TableCell>
                </TableRow>
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
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
                          <div className="truncate text-xs text-muted-foreground">
                            {product.description || product.slug}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-40 max-w-52">
                        {product.productVertical === "JEWELLERY" ? (
                          <ProductSelectMenu
                            ariaLabel={`Change jewellery type for ${product.name}`}
                            value={normalizedJewelleryTypeFor(
                              product.jewelleryType,
                            )}
                            options={productJewelleryTypes}
                            disabled={
                              !canUpdateProducts ||
                              updatingProductId === product.id
                            }
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
                            disabled={
                              !canUpdateProducts ||
                              updatingProductId === product.id
                            }
                            onChange={(value) =>
                              void updateProductInline(product, {
                                categoryName: value,
                              })
                            }
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatPrice(product)}</TableCell>
                    <TableCell>
                      <ProductStatusToggle
                        active={product.active}
                        disabled={
                          !canUpdateProducts || updatingProductId === product.id
                        }
                        onChange={(active) =>
                          void updateProductInline(product, { active })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canUpdateProducts}
                          onClick={() => setEditing(product)}
                        >
                          <Edit3Icon aria-hidden="true" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canUpdateProducts}
                          aria-label={`Delete ${product.name}`}
                          onClick={() => setDeleting(product)}
                        >
                          <Trash2Icon aria-hidden="true" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </PageSection>

      <ProductDialog
        open={creating}
        accessToken={accessToken}
        storeId={storeId}
        defaultCurrency={defaultCurrency}
        defaultVertical={productVertical}
        onOpenChange={setCreating}
        onSaved={async () => {
          setCreating(false);
          await load();
        }}
      />
      <ProductDialog
        open={editing !== null}
        accessToken={accessToken}
        storeId={storeId}
        product={editing}
        defaultCurrency={defaultCurrency}
        defaultVertical={productVertical}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
          }
        }}
        onSaved={async () => {
          setEditing(null);
          await load();
        }}
      />
      <DeleteProductDialog
        product={deleting}
        deleting={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDeleteProduct()}
      />
    </PageContainer>
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

function ProductDialog({
  open,
  accessToken,
  storeId,
  defaultCurrency,
  defaultVertical,
  product,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  accessToken: string | null;
  storeId: string;
  defaultCurrency: string;
  defaultVertical: ProductVertical;
  product?: StoreProduct | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState(() =>
    formFromProduct(product ?? null, defaultVertical),
  );
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const currencySymbol = currencySymbolFor(defaultCurrency);

  useEffect(() => {
    if (!open) {
      return;
    }
    setForm(formFromProduct(product ?? null, defaultVertical));
    setFile(null);
    setFilePreview(null);
    setError(null);
  }, [defaultVertical, open, product]);

  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return;
    }
    const nextPreview = URL.createObjectURL(file);
    setFilePreview(nextPreview);
    return () => URL.revokeObjectURL(nextPreview);
  }, [file]);

  async function save() {
    if (!accessToken) {
      return;
    }
    if (!form.name.trim() || !productTypeIsComplete(form)) {
      setError("Product name and type are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const image = await resolveImageInput({
        accessToken,
        storeId,
        file,
        imageUrl: form.imageUrl,
        existingProduct: product ?? null,
        productVertical: form.productVertical,
      });
      const input = productInputFromForm(form, image, defaultCurrency);
      if (product) {
        await updateStoreProduct(accessToken, storeId, product.id, input);
      } else {
        await createStoreProduct(accessToken, storeId, input);
      }
      await onSaved();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  const previewUrl = filePreview || form.imageUrl || product?.image.url;
  const productKindLabel =
    form.productVertical === "JEWELLERY" ? "Jewellery" : "Garment";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {product ? "Edit Product" : `Add ${productKindLabel}`}
          </DialogTitle>
          <DialogDescription>
            Manage product details and the image used for Try-On.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <div className="grid max-h-[68vh] gap-5 overflow-y-auto pr-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border bg-muted/25">
              <div className="aspect-[4/5] bg-background">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="grid h-full place-items-center text-muted-foreground">
                    <ImageIcon size={34} aria-hidden="true" />
                  </div>
                )}
              </div>
              <label className="flex cursor-pointer items-center justify-center gap-2 border-t border-primary bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                <UploadIcon size={16} aria-hidden="true" />
                Upload Image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <label className="space-y-2 text-sm">
              <span>Image URL</span>
              <Input
                value={form.imageUrl}
                placeholder="https://..."
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    imageUrl: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm sm:col-span-2">
                <span>Name *</span>
                <Input
                  value={form.name}
                  maxLength={180}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="space-y-2 text-sm">
                <span>{productKindLabel} Type *</span>
                {form.productVertical === "JEWELLERY" ? (
                  <ProductSelectMenu
                    ariaLabel="Select jewellery type"
                    value={form.jewelleryType}
                    options={productJewelleryTypes}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        jewelleryType: value,
                        categoryName: jewelleryCategoryNameForType(value),
                      }))
                    }
                  />
                ) : (
                  <ProductSelectMenu
                    ariaLabel="Select garment type"
                    value={form.categoryName}
                    options={productGarmentTypes}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        categoryName: value,
                      }))
                    }
                  />
                )}
              </label>
              <label className="space-y-2 text-sm">
                <span>Audience</span>
                <ProductSelectMenu
                  ariaLabel="Select product audience"
                  value={form.audience}
                  options={productAudiences}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      audience: value,
                    }))
                  }
                />
              </label>
              <label className="space-y-2 text-sm">
                <span>Price ({currencySymbol})</span>
                <div className="relative">
                  <Input
                    className="pr-16"
                    value={form.price}
                    inputMode="decimal"
                    placeholder="49.99"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        price: event.target.value,
                      }))
                    }
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                    {currencySymbol}
                  </span>
                </div>
              </label>
            </div>

            <label className="space-y-2 text-sm">
              <span>Description</span>
              <Textarea
                value={form.description}
                maxLength={1000}
                rows={4}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>

            <label className="space-y-2 text-sm">
              <span>Product URL</span>
              <Input
                value={form.productUrl}
                placeholder="https://..."
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    productUrl: event.target.value,
                  }))
                }
              />
            </label>

            <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
              <label className="flex items-center gap-3 text-sm font-medium">
                <ProductToggleCheckbox
                  checked={form.active}
                  onChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      active: checked,
                    }))
                  }
                />
                Active
              </label>
              <label className="flex items-center gap-3 text-sm font-medium">
                <ProductToggleCheckbox
                  checked={form.vtoEnabled}
                  onChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      vtoEnabled: checked,
                    }))
                  }
                />
                Try-On enabled
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            Save Product
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
        <img
          src={product.image.url}
          alt=""
          className="h-full w-full object-contain"
        />
      ) : (
        <ImageIcon size={20} aria-hidden="true" />
      )}
    </div>
  );
}

type ProductForm = {
  name: string;
  productVertical: ProductVertical;
  categoryName: string;
  jewelleryType: JewelleryType;
  audience: string;
  price: string;
  description: string;
  productUrl: string;
  imageUrl: string;
  active: boolean;
  vtoEnabled: boolean;
};

function formFromProduct(
  product: StoreProduct | null,
  defaultVertical: ProductVertical,
): ProductForm {
  const productVertical = product?.productVertical ?? defaultVertical;
  const jewelleryType = normalizedJewelleryTypeFor(product?.jewelleryType);
  return {
    name: product?.name ?? "",
    productVertical,
    categoryName:
      productVertical === "JEWELLERY"
        ? jewelleryCategoryNameForType(jewelleryType)
        : normalizedProductTypeFor(
            product?.categoryName,
            product?.garmentIntent,
          ),
    jewelleryType,
    audience: product?.audience ?? "UNISEX",
    price:
      product?.priceAmountCents !== null &&
      product?.priceAmountCents !== undefined
        ? (product.priceAmountCents / 100).toFixed(2)
        : "",
    description: product?.description ?? "",
    productUrl: product?.productUrl ?? "",
    imageUrl: product?.image.storageKey ? "" : (product?.image.url ?? ""),
    active: product?.active ?? true,
    vtoEnabled: product?.vtoEnabled ?? true,
  };
}

function productTypeIsComplete(form: ProductForm): boolean {
  return form.productVertical === "JEWELLERY"
    ? Boolean(form.jewelleryType)
    : Boolean(form.categoryName.trim());
}

function productInputFromForm(
  form: ProductForm,
  image: StoreProductInput["image"] | undefined,
  defaultCurrency: string,
): StoreProductInput {
  const base = {
    name: form.name.trim(),
    description: form.description.trim() || null,
    audience: form.audience.trim().toUpperCase() || "UNISEX",
    priceAmountCents: priceToCents(form.price),
    priceCurrency: form.price.trim() ? defaultCurrency : null,
    productUrl: form.productUrl.trim() || null,
    active: form.active,
    vtoEnabled: form.vtoEnabled,
    ...(image !== undefined ? { image } : {}),
  };

  if (form.productVertical === "JEWELLERY") {
    const jewelleryType = normalizedJewelleryTypeFor(form.jewelleryType);
    return {
      ...base,
      categoryName: jewelleryCategoryNameForType(jewelleryType),
      productVertical: "JEWELLERY",
      jewelleryType,
    };
  }

  return {
    ...base,
    categoryName: form.categoryName.trim(),
    productVertical: "GARMENT",
    jewelleryType: null,
    garmentIntent: garmentIntentForProductType(form.categoryName),
    garmentCategory: garmentCategoryForProductType(form.categoryName),
    garmentPhotoType: "AUTO",
  };
}

type ProductInlineOverrides = Partial<Pick<StoreProductInput, "active">> & {
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
    vtoEnabled: product.vtoEnabled,
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

async function resolveImageInput({
  accessToken,
  storeId,
  file,
  imageUrl,
  existingProduct,
  productVertical,
}: {
  accessToken: string;
  storeId: string;
  file: File | null;
  imageUrl: string;
  existingProduct: StoreProduct | null;
  productVertical: ProductVertical;
}): Promise<StoreProductInput["image"] | undefined> {
  if (file) {
    const dimensions = await readImageDimensions(file);
    assertJewelleryProductImageDimensions(productVertical, dimensions);
    const intent = await createStoreProductImageUploadIntent(
      accessToken,
      storeId,
      {
        contentType: file.type,
        sizeBytes: file.size,
        fileName: file.name,
      },
    );
    const response = await fetch(intent.uploadUrl, {
      method: intent.method,
      headers: intent.headers,
      body: file,
    });
    if (!response.ok) {
      throw new Error("Product image could not be uploaded.");
    }
    return {
      storageKey: intent.storageKey,
      contentType: file.type,
      width: dimensions.width,
      height: dimensions.height,
    };
  }
  const trimmedUrl = imageUrl.trim();
  if (trimmedUrl) {
    if (productVertical === "JEWELLERY") {
      const dimensions = await readImageDimensions(trimmedUrl);
      assertJewelleryProductImageDimensions(productVertical, dimensions);
      return { url: trimmedUrl, ...dimensions };
    }
    return { url: trimmedUrl };
  }
  if (existingProduct) {
    return undefined;
  }
  throw new Error("Product image is required.");
}

function priceToCents(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0
    ? Math.round(amount * 100)
    : null;
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

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  if (caught instanceof Error) {
    return caught.message;
  }
  return "The product request could not be completed.";
}
