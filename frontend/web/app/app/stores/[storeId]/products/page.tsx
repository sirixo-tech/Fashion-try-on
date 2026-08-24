"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  Edit3Icon,
  ImageIcon,
  PackageIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldAlertIcon,
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

import { SafeApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  createStoreProduct,
  createStoreProductImageUploadIntent,
  getEffectiveStorePermissions,
  getStore,
  listStoreProducts,
  updateStoreProduct,
  type AdminStoreDetail,
  type StoreProduct,
  type StoreProductInput,
} from "@/lib/stores";

const productStatuses = [
  { value: "ALL", label: "All products" },
  { value: "VTO_ENABLED", label: "Try-On ready" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
] as const;

const garmentIntents = [
  { value: "TOP", label: "Top" },
  { value: "BOTTOM", label: "Bottom" },
  { value: "FULL_OUTFIT", label: "Full outfit" },
] as const;

const garmentCategories = [
  { value: "TOPS", label: "Tops" },
  { value: "BOTTOMS", label: "Bottoms" },
  { value: "DRESSES", label: "Dresses" },
  { value: "OUTERWEAR", label: "Outerwear" },
  { value: "FULL_OUTFIT", label: "Full outfit" },
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
  const [editing, setEditing] = useState<StoreProduct | null>(null);
  const [creating, setCreating] = useState(false);

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
        }),
      ]);
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
  }, [accessToken, page, search, status, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = useMemo(
    () => products.filter((product) => product.active).length,
    [products],
  );

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Store Catalog"
        title="Products"
        description={
          store
            ? `${store.name} catalog products for kiosk Try-On.`
            : "Store catalog products for kiosk Try-On."
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
              disabled={!canUpdateProducts}
              onClick={() => setCreating(true)}
            >
              <PlusIcon aria-hidden="true" />
              Add Product
            </Button>
          </div>
        }
        status={<StatusBadge status="ACTIVE" label={`${activeCount} active`} />}
      />

      {error ? (
        <PageSection>
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <ShieldAlertIcon size={18} aria-hidden="true" />
            {error}
          </div>
        </PageSection>
      ) : null}

      <PageSection>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
          <label className="relative block">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              value={search}
              placeholder="Search products..."
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
            />
          </label>
          <select
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/35"
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as ProductStatus);
            }}
          >
            {productStatuses.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </PageSection>

      <PageSection>
        <TableContainer
          title="Store Products"
          description="Product rows shown here are the Store catalog used by assigned kiosks."
          footer={
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {pagination.total} products, page {pagination.page} of{" "}
                {pagination.totalPages}
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
                <TableHead>Category</TableHead>
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
                      No products match this view.
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
                    <TableCell>{product.categoryName}</TableCell>
                    <TableCell>{formatPrice(product)}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={product.active ? "ACTIVE" : "INACTIVE"}
                        label={product.active ? "Active" : "Inactive"}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={product.vtoEnabled ? "ACTIVE" : "DRAFT"}
                        label={product.vtoEnabled ? "Ready" : "Disabled"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canUpdateProducts}
                        onClick={() => setEditing(product)}
                      >
                        <Edit3Icon aria-hidden="true" />
                        Edit
                      </Button>
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
    </PageContainer>
  );
}

function ProductDialog({
  open,
  accessToken,
  storeId,
  product,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  accessToken: string | null;
  storeId: string;
  product?: StoreProduct | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState(() => formFromProduct(product ?? null));
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setForm(formFromProduct(product ?? null));
    setFile(null);
    setFilePreview(null);
    setError(null);
  }, [open, product]);

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
    if (!form.name.trim() || !form.categoryName.trim()) {
      setError("Product name and category are required.");
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
      });
      const input = productInputFromForm(form, image);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{product ? "Edit Product" : "Add Product"}</DialogTitle>
          <DialogDescription>
            Manage product details and the garment image used for Try-On.
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
              <label className="flex cursor-pointer items-center justify-center gap-2 border-t bg-card px-4 py-3 text-sm font-semibold text-primary">
                <UploadIcon size={16} aria-hidden="true" />
                Upload Image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) =>
                    setFile(event.target.files?.[0] ?? null)
                  }
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
                <span>Category *</span>
                <Input
                  value={form.categoryName}
                  maxLength={120}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      categoryName: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="space-y-2 text-sm">
                <span>Audience</span>
                <Input
                  value={form.audience}
                  maxLength={40}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      audience: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="space-y-2 text-sm">
                <span>Price</span>
                <Input
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
              </label>
              <label className="space-y-2 text-sm">
                <span>Currency</span>
                <Input
                  value={form.currency}
                  maxLength={3}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      currency: event.target.value.toUpperCase(),
                    }))
                  }
                />
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

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span>Garment Type</span>
                <select
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/35"
                  value={form.garmentIntent}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      garmentIntent: event.target.value,
                    }))
                  }
                >
                  {garmentIntents.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span>Category Mapping</span>
                <select
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/35"
                  value={form.garmentCategory}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      garmentCategory: event.target.value,
                    }))
                  }
                >
                  {garmentCategories.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

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
                <input
                  type="checkbox"
                  className="size-5 rounded border-border accent-primary"
                  checked={form.active}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      active: event.target.checked,
                    }))
                  }
                />
                Active
              </label>
              <label className="flex items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-5 rounded border-border accent-primary"
                  checked={form.vtoEnabled}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      vtoEnabled: event.target.checked,
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
  categoryName: string;
  audience: string;
  price: string;
  currency: string;
  description: string;
  productUrl: string;
  imageUrl: string;
  garmentIntent: string;
  garmentCategory: string;
  active: boolean;
  vtoEnabled: boolean;
};

function formFromProduct(product: StoreProduct | null): ProductForm {
  return {
    name: product?.name ?? "",
    categoryName: product?.categoryName ?? "Tops",
    audience: product?.audience ?? "all",
    price:
      product?.priceAmountCents !== null && product?.priceAmountCents !== undefined
        ? (product.priceAmountCents / 100).toFixed(2)
        : "",
    currency: product?.priceCurrency ?? "USD",
    description: product?.description ?? "",
    productUrl: product?.productUrl ?? "",
    imageUrl: product?.image.storageKey ? "" : product?.image.url ?? "",
    garmentIntent: product?.garmentIntent ?? "TOP",
    garmentCategory: product?.garmentCategory ?? "TOPS",
    active: product?.active ?? true,
    vtoEnabled: product?.vtoEnabled ?? true,
  };
}

function productInputFromForm(
  form: ProductForm,
  image: StoreProductInput["image"] | undefined,
): StoreProductInput {
  return {
    name: form.name.trim(),
    categoryName: form.categoryName.trim(),
    description: form.description.trim() || null,
    audience: form.audience.trim() || "all",
    priceAmountCents: priceToCents(form.price),
    priceCurrency: form.price.trim() ? form.currency.trim().toUpperCase() || "USD" : null,
    productUrl: form.productUrl.trim() || null,
    garmentIntent: form.garmentIntent,
    garmentCategory: form.garmentCategory,
    garmentPhotoType: "AUTO",
    active: form.active,
    vtoEnabled: form.vtoEnabled,
    ...(image !== undefined ? { image } : {}),
  };
}

async function resolveImageInput({
  accessToken,
  storeId,
  file,
  imageUrl,
  existingProduct,
}: {
  accessToken: string;
  storeId: string;
  file: File | null;
  imageUrl: string;
  existingProduct: StoreProduct | null;
}): Promise<StoreProductInput["image"] | undefined> {
  if (file) {
    const intent = await createStoreProductImageUploadIntent(accessToken, storeId, {
      contentType: file.type,
      sizeBytes: file.size,
      fileName: file.name,
    });
    const response = await fetch(intent.uploadUrl, {
      method: intent.method,
      headers: intent.headers,
      body: file,
    });
    if (!response.ok) {
      throw new Error("Product image could not be uploaded.");
    }
    const dimensions = await imageDimensions(file);
    return {
      storageKey: intent.storageKey,
      contentType: file.type,
      width: dimensions.width,
      height: dimensions.height,
    };
  }
  const trimmedUrl = imageUrl.trim();
  if (trimmedUrl) {
    return { url: trimmedUrl };
  }
  if (existingProduct) {
    return undefined;
  }
  throw new Error("Product image is required.");
}

function imageDimensions(
  file: File,
): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: null, height: null });
    };
    image.src = url;
  });
}

function priceToCents(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
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

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  if (caught instanceof Error) {
    return caught.message;
  }
  return "The product request could not be completed.";
}
