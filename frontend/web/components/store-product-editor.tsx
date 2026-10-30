"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Button,
  PageContainer,
  CardContent,
  FormSection,
  FormActions,
  PageHeader,
  Input,
  Textarea,
  SelectMenu,
  ErrorState,
  LoadingState,
} from "@selfx/ui";
import { useSession } from "@/lib/session";
import { SafeApiError } from "@/lib/api";
import {
  getCurrentMerchantStore,
  hasStoreResourcePermission,
} from "@/lib/current-store";
import {
  createStoreProduct,
  getStoreProduct,
  getEffectiveStorePermissions,
  listStoreProducts,
  updateStoreProduct,
  type ProductVertical,
  type StoreProduct,
} from "@/lib/stores";
import {
  getProductStock,
  updateProductStock,
  stockPriceToCents,
  stockQuantityFromInput,
  type ProductColorImage,
  type ProductStock,
  type StockOptionMode,
  type StockPricingMode,
} from "@/lib/product-stock";
import {
  productAudiences,
  productGarmentTypes,
  productJewelleryTypes,
  ProductToggleCheckbox,
  jewelleryCategoryNameForType,
} from "./product-form-controls";
import {
  formFromProduct,
  productInputFromForm,
  productTypeIsComplete,
  resolveImageInput,
} from "@/lib/store-product-form";
import { parseTaxRate } from "@/lib/shopping";

type Row = {
  key: number;
  size: string;
  color: string;
  quantity: string;
  price: string;
};
const emptyRow = (key: number): Row => ({
  key,
  size: "",
  color: "",
  quantity: "0",
  price: "",
});
export function StoreProductEditor({
  storeId: targetStore,
  productId,
  vertical = "GARMENT",
}: {
  storeId?: string;
  productId?: string;
  vertical?: ProductVertical;
}) {
  const session = useSession(),
    router = useRouter();
  const token = session.status === "authenticated" ? session.accessToken : null;
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const actorId = session.user?.id;
  const [storeId, setStoreId] = useState<string | null>(null),
    [product, setProduct] = useState<StoreProduct | null>(null);
  const [form, setForm] = useState(() => formFromProduct(null, vertical));
  const [currency, setCurrency] = useState("INR"),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<string | null>(null);
  const [stock, setStock] = useState<ProductStock | null>(null),
    [rows, setRows] = useState<Row[]>([emptyRow(0)]);
  const [mode, setMode] = useState<StockOptionMode>("SINGLE"),
    [pricing, setPricing] = useState<StockPricingMode>("CONSTANT"),
    [track, setTrack] = useState(false);
  const [tax, setTax] = useState(""),
    [reason, setReason] = useState("Product setup"),
    [images, setImages] = useState<ProductColorImage[]>([]),
    [colorFiles, setColorFiles] = useState<Record<string, File>>({});
  const [canEdit, setCanEdit] = useState(false),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [external, setExternal] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const changed = () => {
      setCanEdit(false);
      setStoreId(null);
      setDirty(false);
      setLoading(true);
      setReload((old) => old + 1);
    };
    window.addEventListener("selfx:impersonation-changed", changed);
    return () =>
      window.removeEventListener("selfx:impersonation-changed", changed);
  }, []);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const back = targetStore
    ? `/app/stores/${targetStore}/products`
    : `/app/products/${vertical === "JEWELLERY" ? "jewellery" : "garments"}`;
  const change = () => setDirty(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setStock(null);
    setRows([emptyRow(0)]);
    setTrack(false);
    setImages([]);
    setColorFiles({});
    setFile(null);
    const accessToken = tokenRef.current;
    if (!accessToken) return;
    void (async () => {
      try {
        const id =
          targetStore ?? (await getCurrentMerchantStore(accessToken))?.id;
        if (!id) throw new Error("Store access required.");
        const permission = await getEffectiveStorePermissions(accessToken, id);
        if (!hasStoreResourcePermission(permission, "stores.view"))
          throw new Error("Store product viewing is not permitted.");
        const [item, listing] = await Promise.all([
          productId ? getStoreProduct(accessToken, id, productId) : null,
          listStoreProducts(accessToken, id, { pageSize: 1 }),
        ]);
        let currentStock: ProductStock | null = null,
          managedExternally =
            item?.catalogSource === "SHOPIFY" ||
            item?.catalogSource === "WOOCOMMERCE";
        if (productId && !managedExternally) {
          try {
            currentStock = await getProductStock(accessToken, id, productId);
          } catch (caught) {
            if (
              caught instanceof SafeApiError &&
              caught.code === "PRODUCT_STOCK_EXTERNALLY_MANAGED"
            )
              managedExternally = true;
            else throw caught;
          }
        }
        if (!active) return;
        setStoreId(id);
        setProduct(item);
        setForm(formFromProduct(item, vertical));
        setCurrency(item?.priceCurrency ?? listing.defaultCurrency ?? "INR");
        setCanEdit(
          hasStoreResourcePermission(permission, "products.manage") &&
            !managedExternally,
        );
        setExternal(managedExternally);
        if (currentStock) {
          setStock(currentStock);
          setMode(currentStock.optionMode);
          setPricing(currentStock.pricingMode);
          setTrack(currentStock.configured);
          setImages(currentStock.colorImages ?? []);
          setTax(
            currentStock.taxRateBasisPoints == null
              ? ""
              : String(currentStock.taxRateBasisPoints / 100),
          );
          setRows(
            currentStock.variants.length
              ? currentStock.variants.map((v, key) => ({
                  key,
                  size: v.size ?? "",
                  color: v.color ?? "",
                  quantity: String(v.stockQuantity),
                  price:
                    v.priceOverrideAmountCents == null
                      ? ""
                      : (v.priceOverrideAmountCents / 100).toFixed(2),
                }))
              : [emptyRow(0)],
          );
        }
      } catch (caught) {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "Product could not be loaded.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [session.status, actorId, targetStore, productId, vertical, reload]);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, []);
  useEffect(() => {
    const guard = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest("a[href]");
      if (
        dirtyRef.current &&
        anchor &&
        anchor.getAttribute("href") !== "#" &&
        !window.confirm("Discard unsaved product changes?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, []);
  const leave = () => {
    if (!dirty || window.confirm("Discard unsaved product changes?"))
      router.push(back);
  };
  const hasSize = mode === "SIZE" || mode === "SIZE_COLOR",
    hasColor = mode === "COLOR" || mode === "SIZE_COLOR";
  const colors = [
    ...new Map(
      rows.flatMap((row) =>
        row.color.trim()
          ? [
              [
                row.color.trim().replace(/\s+/g, " ").toLowerCase(),
                row.color.trim().replace(/\s+/g, " "),
              ] as const,
            ]
          : [],
      ),
    ).values(),
  ];
  const updateRow = (key: number, patch: Partial<Row>) => {
    setRows((old) =>
      old.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
    setTrack(true);
    change();
  };
  async function save() {
    if (!token || !storeId || !canEdit || saving) return;
    setSaving(true);
    setError("");
    let basicSaved = false;
    try {
      if (!form.name.trim() || !productTypeIsComplete(form))
        throw new Error("Product name and type are required.");
      const variants = track
        ? rows.map((row) => ({
            size: hasSize
              ? row.size.normalize("NFKC").trim().replace(/\s+/g, " ")
              : null,
            color: hasColor
              ? row.color.normalize("NFKC").trim().replace(/\s+/g, " ")
              : null,
            stockQuantity: stockQuantityFromInput(row.quantity),
            priceOverrideAmountCents:
              pricing === "VARIANT" ? stockPriceToCents(row.price) : null,
          }))
        : [];
      if (
        track &&
        (variants.length < 1 ||
          variants.length > 100 ||
          (mode === "SINGLE" && variants.length !== 1) ||
          variants.some((v) => (hasSize && !v.size) || (hasColor && !v.color)))
      )
        throw new Error(
          "Provide each required size and colour, with up to 100 combinations.",
        );
      if (
        track &&
        new Set(
          variants.map((v) =>
            JSON.stringify([v.size?.toLowerCase(), v.color?.toLowerCase()]),
          ),
        ).size !== variants.length
      )
        throw new Error("Duplicate size/colour combinations are not allowed.");
      const taxRate = tax.trim() ? parseTaxRate(tax) : null;
      if (track && !reason.trim())
        throw new Error("Enter a reason for the stock change.");
      const basicInput = productInputFromForm(form, undefined, currency);
      if (form.price.trim() && !/^[A-Z]{3}$/.test(currency))
        throw new Error("Use a three-letter currency code.");
      const image = await resolveImageInput({
        accessToken: token,
        storeId,
        file,
        imageUrl: form.imageUrl,
        existingProduct: product,
        productVertical: form.productVertical,
      });
      const colorImages: ProductColorImage[] = [];
      if (hasColor)
        for (const color of colors) {
          const key = color.toLowerCase(),
            upload = colorFiles[key];
          if (upload) {
            const uploaded = await resolveImageInput({
              accessToken: token,
              storeId,
              file: upload,
              imageUrl: "",
              existingProduct: null,
              productVertical: "GARMENT",
            });
            if (
              uploaded?.storageKey &&
              uploaded.contentType &&
              uploaded.width &&
              uploaded.height
            )
              colorImages.push({
                color,
                storageKey: uploaded.storageKey,
                contentType: uploaded.contentType,
                width: uploaded.width,
                height: uploaded.height,
              });
          } else {
            const existing = images.find((i) => i.color.toLowerCase() === key);
            if (existing) {
              colorImages.push({
                color,
                storageKey: existing.storageKey,
                contentType: existing.contentType,
                width: existing.width,
                height: existing.height,
              });
            }
          }
        }
      const input = {
        ...basicInput,
        ...(image === undefined ? {} : { image }),
      };
      const saved = product
        ? await updateStoreProduct(token, storeId, product.id, input)
        : await createStoreProduct(token, storeId, input);
      basicSaved = true;
      setProduct(saved);
      setFile(null);
      setForm(formFromProduct(saved, vertical));
      if (track) {
        const updated = await updateProductStock(token, storeId, saved.id, {
          expectedVersion: stock?.version ?? 0,
          optionMode: mode,
          pricingMode: pricing,
          taxRateBasisPoints: taxRate,
          variants,
          reason,
          colorImages,
        });
        setStock(updated);
        setImages(updated.colorImages ?? []);
        setColorFiles({});
      }
      setDirty(false);
      dirtyRef.current = false;
      router.push(back);
    } catch (caught) {
      if (caught instanceof SafeApiError && caught.status === 403)
        setCanEdit(false);
      setError(
        `${basicSaved ? "Product details were saved, but stock changes were not. Review and retry. " : ""}${caught instanceof Error ? caught.message : "Product could not be saved."}`,
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading) return <LoadingState label="Loading product" />;
  if (external && product)
    return (
      <PageContainer>
        <PageHeader
          title={product.name}
          description="This product is managed on its original commerce website."
          actions={
            <Button variant="outline" onClick={() => router.push(back)}>
              Products
            </Button>
          }
        />
        <section>
          <CardContent className="space-y-4 p-0">
            <p>{product.description}</p>
            <p>
              Use the Products list to manage SelfX Try-On availability. Product
              details, options, pricing and purchases stay on the original
              website.
            </p>
            {product.productUrl && /^https?:\/\//i.test(product.productUrl) ? (
              <a
                href={product.productUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Original product page
              </a>
            ) : null}
          </CardContent>
        </section>
      </PageContainer>
    );
  if (!storeId)
    return <ErrorState title="Product unavailable" description={error} />;
  return (
    <PageContainer>
      <PageHeader
        title={
          product
            ? canEdit
              ? `Edit ${product.name}`
              : product.name
            : "Add Product"
        }
        description="Product information, images, pricing and available options."
      />
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive p-3 text-destructive"
        >
          {error}
        </p>
      )}
      {external && (
        <p>
          Product details, pricing and stock are managed by the connected shop.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section>
          <CardContent className="p-0">
            <FormSection title="Basic information">
              {!canEdit ? (
                <dl className="grid gap-3">
                  <div>
                    <dt>Name</dt>
                    <dd>{form.name}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>{form.categoryName}</dd>
                  </div>
                  <div>
                    <dt>Audience</dt>
                    <dd>{form.audience}</dd>
                  </div>
                  <div>
                    <dt>Description</dt>
                    <dd>{form.description || "—"}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      {form.active ? "Active" : "Inactive"} · Try-On{" "}
                      {form.vtoEnabled ? "enabled" : "disabled"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <fieldset disabled={saving} className="grid gap-4">
                  <label>
                    Name *
                    <Input
                      value={form.name}
                      maxLength={180}
                      onChange={(e) => {
                        setForm({ ...form, name: e.target.value });
                        change();
                      }}
                    />
                  </label>
                  <label>
                    Type
                    <SelectMenu
                      ariaLabel="Product type"
                      value={
                        form.productVertical === "JEWELLERY"
                          ? form.jewelleryType
                          : form.categoryName
                      }
                      options={
                        form.productVertical === "JEWELLERY"
                          ? productJewelleryTypes
                          : productGarmentTypes
                      }
                      disabled={!canEdit || saving}
                      onChange={(value) => {
                        setForm(
                          form.productVertical === "JEWELLERY"
                            ? {
                                ...form,
                                jewelleryType:
                                  value as typeof form.jewelleryType,
                                categoryName:
                                  jewelleryCategoryNameForType(value),
                              }
                            : { ...form, categoryName: value },
                        );
                        change();
                      }}
                    />
                  </label>
                  <label>
                    Audience
                    <SelectMenu
                      ariaLabel="Audience"
                      value={form.audience}
                      options={productAudiences}
                      disabled={!canEdit || saving}
                      onChange={(value) => {
                        setForm({ ...form, audience: value });
                        change();
                      }}
                    />
                  </label>
                  <label>
                    Description
                    <Textarea
                      value={form.description}
                      maxLength={1000}
                      onChange={(e) => {
                        setForm({ ...form, description: e.target.value });
                        change();
                      }}
                    />
                  </label>
                  <label>
                    Product URL
                    <Input
                      value={form.productUrl}
                      onChange={(e) => {
                        setForm({ ...form, productUrl: e.target.value });
                        change();
                      }}
                    />
                  </label>
                  <div className="flex gap-5">
                    <label className="flex items-center gap-2">
                      <ProductToggleCheckbox
                        checked={form.active}
                        onChange={(value) => {
                          setForm({ ...form, active: value });
                          change();
                        }}
                      />
                      Active
                    </label>
                    <label className="flex items-center gap-2">
                      <ProductToggleCheckbox
                        checked={form.vtoEnabled}
                        onChange={(value) => {
                          setForm({ ...form, vtoEnabled: value });
                          change();
                        }}
                      />
                      Try-On enabled
                    </label>
                  </div>
                </fieldset>
              )}
            </FormSection>
          </CardContent>
        </section>
        <section>
          <CardContent className="p-0">
            <FormSection
              title="Product image"
              description="Main catalog and Try-On image. Colour images below are optional purchase previews."
            >
              {(preview || form.imageUrl || product?.image.url) && (
                <Image
                  unoptimized
                  src={preview || form.imageUrl || product!.image.url!}
                  width={600}
                  height={700}
                  alt="Product preview"
                  className="max-h-72 w-full object-contain"
                />
              )}
              {canEdit && (
                <>
                  <label>
                    Upload main image
                    <Input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={saving}
                      onChange={(e) => {
                        setFile(e.target.files?.[0] ?? null);
                        change();
                      }}
                    />
                  </label>
                  <label>
                    Image URL
                    <Input
                      value={form.imageUrl}
                      disabled={saving}
                      onChange={(e) => {
                        setForm({ ...form, imageUrl: e.target.value });
                        change();
                      }}
                    />
                  </label>
                </>
              )}
            </FormSection>
          </CardContent>
        </section>
      </div>
      <div id="pricing" />
      <section className="border-t pt-6">
        <CardContent className="p-0">
          <FormSection
            title="Pricing & variants"
            description="One product in the kiosk catalog. Customers select available options when buying."
          >
            <fieldset disabled={!canEdit || saving} className="grid gap-4">
              {canEdit ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    Base price
                    <Input
                      aria-label="Base price"
                      inputMode="decimal"
                      value={form.price}
                      onChange={(e) => {
                        setForm({ ...form, price: e.target.value });
                        change();
                      }}
                    />
                  </label>
                  <label>
                    Currency
                    <Input
                      value={currency}
                      maxLength={3}
                      onChange={(e) => {
                        setCurrency(e.target.value.toUpperCase());
                        change();
                      }}
                    />
                  </label>
                </div>
              ) : (
                <p>
                  Base price: {currency} {form.price || "Not set"}
                </p>
              )}
              {canEdit && (
                <label className="flex items-center gap-2">
                  <ProductToggleCheckbox
                    checked={track}
                    disabled={saving || stock?.configured}
                    onChange={(value) => {
                      if (!value && stock?.configured) return;
                      setTrack(value);
                      change();
                    }}
                  />
                  {stock?.configured
                    ? "Purchase stock configured — set quantities to zero to stop purchases"
                    : "Configure purchase stock"}
                </label>
              )}
              {(track || !canEdit) && (
                <>
                  {canEdit && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <SelectMenu
                        ariaLabel="Product options"
                        value={mode}
                        disabled={!canEdit || saving}
                        options={[
                          { value: "SINGLE", label: "No size or colour" },
                          { value: "SIZE", label: "Sizes only" },
                          { value: "COLOR", label: "Colours only" },
                          { value: "SIZE_COLOR", label: "Sizes and colours" },
                        ]}
                        onChange={(value) => {
                          setMode(value);
                          setRows([emptyRow(0)]);
                          change();
                        }}
                      />
                      <SelectMenu
                        ariaLabel="Variant pricing"
                        value={pricing}
                        disabled={!canEdit || saving}
                        options={[
                          { value: "CONSTANT", label: "Same product price" },
                          {
                            value: "VARIANT",
                            label: "Optional variant prices",
                          },
                        ]}
                        onChange={(value) => {
                          setPricing(value);
                          change();
                        }}
                      />
                    </div>
                  )}
                  {canEdit ? (
                    rows.map((row, i) => (
                      <div
                        className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-5"
                        key={row.key}
                      >
                        {hasSize && (
                          <label>
                            Size
                            <Input
                              aria-label={`Size ${i + 1}`}
                              value={row.size}
                              maxLength={80}
                              onChange={(e) =>
                                updateRow(row.key, { size: e.target.value })
                              }
                            />
                          </label>
                        )}
                        {hasColor && (
                          <label>
                            Colour
                            <Input
                              aria-label={`Colour ${i + 1}`}
                              value={row.color}
                              maxLength={80}
                              onChange={(e) =>
                                updateRow(row.key, { color: e.target.value })
                              }
                            />
                          </label>
                        )}
                        <label>
                          Stock
                          <Input
                            aria-label={`Stock ${i + 1}`}
                            type="number"
                            min={0}
                            step={1}
                            value={row.quantity}
                            onChange={(e) =>
                              updateRow(row.key, { quantity: e.target.value })
                            }
                          />
                        </label>
                        {pricing === "VARIANT" && (
                          <label>
                            Variant price
                            <Input
                              aria-label={`Variant price ${i + 1}`}
                              placeholder="Use base price"
                              value={row.price}
                              onChange={(e) =>
                                updateRow(row.key, { price: e.target.value })
                              }
                            />
                          </label>
                        )}
                        {mode !== "SINGLE" && (
                          <Button
                            variant="outline"
                            aria-label={`Remove option ${i + 1}`}
                            disabled={rows.length <= 1}
                            onClick={() => {
                              setRows(rows.filter((r) => r.key !== row.key));
                              change();
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div>
                      {stock?.variants.map((v) => (
                        <p key={v.id}>
                          {[v.size, v.color].filter(Boolean).join(" / ") ||
                            "Standard"}{" "}
                          · {v.availableStockQuantity ?? v.stockQuantity}{" "}
                          available · {currency}{" "}
                          {v.effectivePriceAmountCents == null
                            ? "Price not set"
                            : (v.effectivePriceAmountCents / 100).toFixed(2)}
                        </p>
                      ))}
                    </div>
                  )}
                  {canEdit && mode !== "SINGLE" && (
                    <Button
                      variant="outline"
                      disabled={rows.length >= 100}
                      onClick={() => {
                        setRows([
                          ...rows,
                          emptyRow(Math.max(...rows.map((r) => r.key)) + 1),
                        ]);
                        change();
                      }}
                    >
                      Add option
                    </Button>
                  )}
                  {hasColor && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {colors.map((color) => {
                        const key = color.toLowerCase(),
                          existing = images.find(
                            (i) => i.color.toLowerCase() === key,
                          );
                        return (
                          <div key={key} className="rounded-lg border p-3">
                            <p className="font-medium">
                              {color} image (optional)
                            </p>
                            {existing?.url && !colorFiles[key] && (
                              <Image
                                unoptimized
                                src={existing.url}
                                alt={color}
                                width={160}
                                height={180}
                                className="h-32 w-full object-contain"
                              />
                            )}
                            {colorFiles[key] && (
                              <FilePreview
                                file={colorFiles[key]}
                                color={color}
                              />
                            )}
                            {canEdit && (
                              <>
                                <Input
                                  aria-label={`Image for ${color}`}
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  onChange={(e) => {
                                    const selected = e.target.files?.[0];
                                    if (selected)
                                      setColorFiles({
                                        ...colorFiles,
                                        [key]: selected,
                                      });
                                    change();
                                  }}
                                />
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setImages(
                                      images.filter(
                                        (i) => i.color.toLowerCase() !== key,
                                      ),
                                    );
                                    setColorFiles((old) => {
                                      const next = { ...old };
                                      delete next[key];
                                      return next;
                                    });
                                    change();
                                  }}
                                >
                                  Remove {color} image
                                </Button>
                              </>
                            )}
                            <p className="text-sm text-muted-foreground">
                              Uses the main image when no colour image is
                              supplied.
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {canEdit && (
                    <>
                      <label>
                        Tax override (%)
                        <Input
                          value={tax}
                          placeholder="Store default"
                          onChange={(e) => {
                            setTax(e.target.value);
                            change();
                          }}
                        />
                      </label>
                      <label>
                        Reason for stock change
                        <Input
                          value={reason}
                          maxLength={300}
                          onChange={(e) => {
                            setReason(e.target.value);
                            change();
                          }}
                        />
                      </label>
                    </>
                  )}
                </>
              )}
            </fieldset>
          </FormSection>
        </CardContent>
      </section>
      <div className="sticky bottom-0 z-10 border-t bg-background p-4">
        <FormActions>
          <Button variant="outline" disabled={saving} onClick={leave}>
            {canEdit ? "Cancel" : "Back"}
          </Button>
          {canEdit && (
            <Button disabled={saving || !dirty} onClick={() => void save()}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          )}
        </FormActions>
      </div>
    </PageContainer>
  );
}

function FilePreview({ file, color }: { file: File; color: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? (
    <Image
      unoptimized
      src={url}
      width={160}
      height={180}
      alt={color + " upload preview"}
      className="h-32 w-full object-contain"
    />
  ) : null;
}
