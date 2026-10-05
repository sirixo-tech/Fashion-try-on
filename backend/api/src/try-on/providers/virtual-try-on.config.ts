import { type VirtualTryOnProviderName } from "./virtual-try-on.provider.js";

const SUPPORTED_VIRTUAL_TRY_ON_PROVIDERS = ["fashn", "google"] as const;
const BYTES_PER_MIB = 1024 * 1024;

export const DEFAULT_GARMENT_TRYON_UPLOAD_MAX_IMAGE_BYTES =
  10 * BYTES_PER_MIB;
export const DEFAULT_GARMENT_TRYON_PROVIDER_MAX_IMAGE_BYTES =
  7 * BYTES_PER_MIB;
export const DEFAULT_GARMENT_TRYON_PROVIDER_TARGET_IMAGE_BYTES =
  Math.floor(6.5 * BYTES_PER_MIB);
export const DEFAULT_JEWELLERY_TRYON_UPLOAD_MAX_IMAGE_BYTES =
  10 * BYTES_PER_MIB;
export const DEFAULT_JEWELLERY_TRYON_PROVIDER_MAX_IMAGE_BYTES =
  10 * BYTES_PER_MIB;
export const DEFAULT_JEWELLERY_TRYON_PROVIDER_TARGET_IMAGE_BYTES =
  10 * BYTES_PER_MIB;

export function readGarmentPreprocessingEnabled(): boolean {
  return process.env.GARMENT_PREPROCESSING_ENABLED === "true";
}

export function readGarmentMaskGenerationEnabled(): boolean {
  return process.env.GARMENT_MASK_GENERATION_ENABLED === "true";
}

export function readGarmentTryOnUploadMaxImageBytes(): number {
  return readPositiveIntegerEnv(
    "GARMENT_TRYON_UPLOAD_MAX_IMAGE_BYTES",
    DEFAULT_GARMENT_TRYON_UPLOAD_MAX_IMAGE_BYTES,
  );
}

export function readGarmentTryOnProviderMaxImageBytes(): number {
  return readPositiveIntegerEnv(
    "GARMENT_TRYON_PROVIDER_MAX_IMAGE_BYTES",
    DEFAULT_GARMENT_TRYON_PROVIDER_MAX_IMAGE_BYTES,
  );
}

export function readGarmentTryOnProviderTargetImageBytes(): number {
  return Math.min(
    readPositiveIntegerEnv(
      "GARMENT_TRYON_PROVIDER_TARGET_IMAGE_BYTES",
      DEFAULT_GARMENT_TRYON_PROVIDER_TARGET_IMAGE_BYTES,
    ),
    readGarmentTryOnProviderMaxImageBytes(),
  );
}

export function readJewelleryTryOnUploadMaxImageBytes(): number {
  return readPositiveIntegerEnv(
    "JEWELLERY_TRYON_UPLOAD_MAX_IMAGE_BYTES",
    DEFAULT_JEWELLERY_TRYON_UPLOAD_MAX_IMAGE_BYTES,
  );
}

export function readJewelleryTryOnProviderMaxImageBytes(): number {
  return readPositiveIntegerEnv(
    "JEWELLERY_TRYON_PROVIDER_MAX_IMAGE_BYTES",
    DEFAULT_JEWELLERY_TRYON_PROVIDER_MAX_IMAGE_BYTES,
  );
}

export function readJewelleryTryOnProviderTargetImageBytes(): number {
  return Math.min(
    readPositiveIntegerEnv(
      "JEWELLERY_TRYON_PROVIDER_TARGET_IMAGE_BYTES",
      DEFAULT_JEWELLERY_TRYON_PROVIDER_TARGET_IMAGE_BYTES,
    ),
    readJewelleryTryOnProviderMaxImageBytes(),
  );
}

export function readVirtualTryOnProviderName(): VirtualTryOnProviderName {
  const configured =
    process.env.SELFX_TRYON_PROVIDER?.trim().toLowerCase() || "fashn";

  if (
    (SUPPORTED_VIRTUAL_TRY_ON_PROVIDERS as readonly string[]).includes(
      configured,
    )
  ) {
    return configured as VirtualTryOnProviderName;
  }

  throw new Error(
    `Unsupported SELFX_TRYON_PROVIDER "${configured}". Supported values: ${SUPPORTED_VIRTUAL_TRY_ON_PROVIDERS.join(
      ", ",
    )}.`,
  );
}

function readPositiveIntegerEnv(key: string, fallback: number): number {
  const value = process.env[key]?.trim();
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
