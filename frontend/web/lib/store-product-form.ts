import {
  assertJewelleryProductImageDimensions,
  garmentCategoryForProductType,
  garmentIntentForProductType,
  jewelleryCategoryNameForType,
  normalizedJewelleryTypeFor,
  normalizedProductTypeFor,
} from "@/components/product-form-controls";
import { readImageDimensions } from "@/lib/image-dimensions";
import {
  createStoreProductImageUploadIntent,
  type JewelleryType,
  type ProductVertical,
  type StoreProduct,
  type StoreProductInput,
} from "@/lib/stores";
export type ProductForm = {
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

export function formFromProduct(
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

export function productTypeIsComplete(form: ProductForm): boolean {
  return form.productVertical === "JEWELLERY"
    ? Boolean(form.jewelleryType)
    : Boolean(form.categoryName.trim());
}

export function productInputFromForm(
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

export async function resolveImageInput({
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
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized))
    throw new Error("Enter a valid price with up to two decimal places.");
  const amount = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(amount) || amount > 100_000_000)
    throw new Error("Price exceeds the supported amount.");
  return amount;
}
