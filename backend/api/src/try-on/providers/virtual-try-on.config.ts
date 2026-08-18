import { type VirtualTryOnProviderName } from "./virtual-try-on.provider.js";

const SUPPORTED_VIRTUAL_TRY_ON_PROVIDERS = ["fashn"] as const;

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
