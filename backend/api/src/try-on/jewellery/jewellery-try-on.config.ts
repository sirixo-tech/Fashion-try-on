import type { JewelleryTryOnProviderName } from "./jewellery-try-on.provider.js";

const SUPPORTED_JEWELLERY_TRY_ON_PROVIDERS = ["perfect-corp"] as const;

export function readJewelleryTryOnProviderName(): JewelleryTryOnProviderName {
  const configured =
    process.env.SELFX_JEWELLERY_TRY_ON_PROVIDER?.trim().toLowerCase() ||
    "perfect-corp";

  if (
    (SUPPORTED_JEWELLERY_TRY_ON_PROVIDERS as readonly string[]).includes(
      configured,
    )
  ) {
    return configured as JewelleryTryOnProviderName;
  }

  throw new Error(
    `Unsupported SELFX_JEWELLERY_TRY_ON_PROVIDER "${configured}". Supported values: ${SUPPORTED_JEWELLERY_TRY_ON_PROVIDERS.join(
      ", ",
    )}.`,
  );
}
