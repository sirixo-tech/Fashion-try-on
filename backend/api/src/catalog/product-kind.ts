export const PRODUCT_VERTICALS = ["GARMENT", "JEWELLERY"] as const;
export type ProductVertical = (typeof PRODUCT_VERTICALS)[number];

export const JEWELLERY_TYPES = [
  "RING",
  "BRACELET",
  "NECKLACE",
  "EARRING",
] as const;
export type JewelleryType = (typeof JEWELLERY_TYPES)[number];

export const JEWELLERY_PRODUCT_IMAGE_MIN_DIMENSION = 640;
export const JEWELLERY_PRODUCT_IMAGE_MAX_DIMENSION = 4_096;

export type ProductKind =
  | {
      productVertical: "GARMENT";
      jewelleryType: null;
    }
  | {
      productVertical: "JEWELLERY";
      jewelleryType: JewelleryType;
    };

type ProductKindInput = {
  productVertical?: string | null;
  jewelleryType?: string | null;
};

type ExistingProductKind = {
  product_vertical: string;
  jewellery_type: string | null;
};

type InvalidProduct = (message: string) => never;

const productVerticalSet = new Set<string>(PRODUCT_VERTICALS);
const jewelleryTypeSet = new Set<string>(JEWELLERY_TYPES);

export function resolveCreateProductKind(
  input: ProductKindInput,
  invalid: InvalidProduct,
): ProductKind {
  const productVertical = normalizeProductVertical(
    input.productVertical,
    invalid,
  );
  return normalizeProductKind(
    {
      productVertical,
      jewelleryType: input.jewelleryType,
    },
    invalid,
  );
}

export function resolveUpdateProductKind(
  existing: ExistingProductKind,
  input: ProductKindInput,
  invalid: InvalidProduct,
): ProductKind {
  const productVertical =
    input.productVertical === undefined
      ? normalizeProductVertical(existing.product_vertical, invalid)
      : normalizeProductVertical(input.productVertical, invalid);
  const jewelleryType =
    input.jewelleryType === undefined
      ? existing.jewellery_type
      : input.jewelleryType;

  return normalizeProductKind({ productVertical, jewelleryType }, invalid);
}

export function jewelleryLegacyGarmentFields(jewelleryType: JewelleryType): {
  garmentIntent: string;
  garmentCategory: string;
  garmentPhotoType: string;
} {
  return {
    garmentIntent: "JEWELLERY",
    garmentCategory: jewelleryType,
    garmentPhotoType: "PRODUCT",
  };
}

export function assertJewelleryProductImageDimensions(
  productKind: ProductKind,
  image: { width?: number | null; height?: number | null },
  invalid: InvalidProduct,
): void {
  if (productKind.productVertical !== "JEWELLERY") {
    return;
  }

  const width = image.width;
  const height = image.height;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    !width ||
    !height
  ) {
    invalid(
      "Jewellery product image dimensions could not be verified. Upload a valid image.",
    );
  }
  if (
    width < JEWELLERY_PRODUCT_IMAGE_MIN_DIMENSION ||
    height < JEWELLERY_PRODUCT_IMAGE_MIN_DIMENSION
  ) {
    invalid("Jewellery product images must be at least 640 x 640 pixels.");
  }
  if (
    width > JEWELLERY_PRODUCT_IMAGE_MAX_DIMENSION ||
    height > JEWELLERY_PRODUCT_IMAGE_MAX_DIMENSION
  ) {
    invalid("Jewellery product images must not exceed 4096 x 4096 pixels.");
  }
}

function normalizeProductVertical(
  value: string | null | undefined,
  invalid: InvalidProduct,
): ProductVertical {
  const normalized = value?.trim().toUpperCase() || "GARMENT";
  if (!productVerticalSet.has(normalized)) {
    invalid("Product vertical must be GARMENT or JEWELLERY.");
  }
  return normalized as ProductVertical;
}

function normalizeProductKind(
  input: {
    productVertical: ProductVertical;
    jewelleryType?: string | null;
  },
  invalid: InvalidProduct,
): ProductKind {
  const rawJewelleryType = input.jewelleryType?.trim().toUpperCase() || null;
  if (input.productVertical === "GARMENT") {
    if (rawJewelleryType) {
      invalid("Jewellery type is only valid for jewellery products.");
    }
    return { productVertical: "GARMENT", jewelleryType: null };
  }

  if (!rawJewelleryType || !jewelleryTypeSet.has(rawJewelleryType)) {
    invalid(
      "Jewellery products require a jewellery type of RING, BRACELET, NECKLACE or EARRING.",
    );
  }

  return {
    productVertical: "JEWELLERY",
    jewelleryType: rawJewelleryType as JewelleryType,
  };
}
