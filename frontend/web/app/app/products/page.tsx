"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
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

import {
  garmentCategoryForProductCategory,
  productAudiences,
  productCategories,
  productGarmentIntents,
  ProductSelectMenu,
  ProductToggleCheckbox,
} from "@/components/product-form-controls";
import { SafeApiError } from "@/lib/api";
import { getPlatformVirtualTryOnSettings } from "@/lib/platform-settings";
import {
  createPlatformProduct,
  createPlatformProductImageUploadIntent,
  listPlatformProducts,
  updatePlatformProduct,
  type PlatformProduct,
  type PlatformProductInput,
} from "@/lib/products";
import { useSession } from "@/lib/session";

const productStatuses = [
  { value: "ALL", label: "All products" },
  { value: "VTO_ENABLED", label: "Try-On ready" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
] as const;

type ProductStatus = (typeof productStatuses)[number]["value"];

export default function ProductsPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [products, setProducts] = useState<PlatformProduct[]>([]);
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlatformProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useState("USD");

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [settings, nextProducts] = await Promise.all([
        getPlatformVirtualTryOnSettings(accessToken),
        listPlatformProducts(accessToken, {
          page,
          pageSize: 25,
          search,
          status,
        }),
      ]);
      setDefaultCurrency(settings.defaultCurrency);
      setProducts(nextProducts.data);
      setPagination(nextProducts.pagination);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, page, search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const readyCount = useMemo(
    () =>
      products.filter((product) => product.active && product.vtoEnabled).length,
    [products],
  );

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Platform Catalog"
        title="Products"
        description="Default SelfX products for platform kiosks and Store fallback catalogs."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            <Button onClick={() => setCreating(true)}>
              <PlusIcon aria-hidden="true" />
              Add Product
            </Button>
          </div>
        }
        status={<StatusBadge status="ACTIVE" label={`${readyCount} ready`} />}
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
              placeholder="Search platform products..."
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
          title="Platform Products"
          description="These products appear for platform-owned kiosks and act as the fallback catalog when a Store has no active products."
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
                      No platform products match this view.
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
        defaultCurrency={defaultCurrency}
        onOpenChange={setCreating}
        onSaved={async () => {
          setCreating(false);
          await load();
        }}
      />
      <ProductDialog
        open={editing !== null}
        accessToken={accessToken}
        product={editing}
        defaultCurrency={defaultCurrency}
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
  defaultCurrency,
  product,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  accessToken: string | null;
  defaultCurrency: string;
  product?: PlatformProduct | null;
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
        file,
        imageUrl: form.imageUrl,
        existingProduct: product ?? null,
      });
      const input = productInputFromForm(form, image, defaultCurrency);
      if (product) {
        await updatePlatformProduct(accessToken, product.id, input);
      } else {
        await createPlatformProduct(accessToken, input);
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
            Manage the default catalog item used by platform kiosks and Store
            fallbacks.
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
                <ProductSelectMenu
                  ariaLabel="Select product category"
                  value={form.categoryName}
                  options={productCategories}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      categoryName: value,
                    }))
                  }
                />
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
                <span>Price ({defaultCurrency})</span>
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
                    {defaultCurrency}
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

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span>Garment Type</span>
                <ProductSelectMenu
                  ariaLabel="Select garment type"
                  value={form.garmentIntent}
                  options={productGarmentIntents}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      garmentIntent: value,
                    }))
                  }
                />
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

function ProductThumb({ product }: { product: PlatformProduct }) {
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
  description: string;
  productUrl: string;
  imageUrl: string;
  garmentIntent: string;
  active: boolean;
  vtoEnabled: boolean;
};

function formFromProduct(product: PlatformProduct | null): ProductForm {
  return {
    name: product?.name ?? "",
    categoryName: product?.categoryName ?? productCategories[0].value,
    audience: product?.audience ?? "UNISEX",
    price:
      product?.priceAmountCents !== null &&
      product?.priceAmountCents !== undefined
        ? (product.priceAmountCents / 100).toFixed(2)
        : "",
    description: product?.description ?? "",
    productUrl: product?.productUrl ?? "",
    imageUrl: product?.image.storageKey ? "" : product?.image.url ?? "",
    garmentIntent: product?.garmentIntent ?? "TOP",
    active: product?.active ?? true,
    vtoEnabled: product?.vtoEnabled ?? true,
  };
}

function productInputFromForm(
  form: ProductForm,
  image: PlatformProductInput["image"] | undefined,
  defaultCurrency: string,
): PlatformProductInput {
  return {
    name: form.name.trim(),
    categoryName: form.categoryName.trim(),
    description: form.description.trim() || null,
    audience: form.audience.trim().toUpperCase() || "UNISEX",
    priceAmountCents: priceToCents(form.price),
    priceCurrency: form.price.trim() ? defaultCurrency : null,
    productUrl: form.productUrl.trim() || null,
    garmentIntent: form.garmentIntent,
    garmentCategory: garmentCategoryForProductCategory(form.categoryName),
    garmentPhotoType: "AUTO",
    active: form.active,
    vtoEnabled: form.vtoEnabled,
    ...(image !== undefined ? { image } : {}),
  };
}

async function resolveImageInput({
  accessToken,
  file,
  imageUrl,
  existingProduct,
}: {
  accessToken: string;
  file: File | null;
  imageUrl: string;
  existingProduct: PlatformProduct | null;
}): Promise<PlatformProductInput["image"] | undefined> {
  if (file) {
    const intent = await createPlatformProductImageUploadIntent(accessToken, {
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

function formatPrice(product: PlatformProduct): string {
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
