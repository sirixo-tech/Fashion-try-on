import { type GarmentPreviewProviderName } from "./garment-preview.provider.js";

const SUPPORTED_GARMENT_PREVIEW_PROVIDERS = ["fashn", "openai"] as const;

export function readGarmentPreviewProviderName(): GarmentPreviewProviderName {
  const configured =
    process.env.SELFX_GARMENT_PREVIEW_PROVIDER?.trim().toLowerCase() || "fashn";

  if (
    (SUPPORTED_GARMENT_PREVIEW_PROVIDERS as readonly string[]).includes(
      configured,
    )
  ) {
    return configured as GarmentPreviewProviderName;
  }

  throw new Error(
    `Unsupported SELFX_GARMENT_PREVIEW_PROVIDER "${configured}". Supported values: ${SUPPORTED_GARMENT_PREVIEW_PROVIDERS.join(
      ", ",
    )}.`,
  );
}
