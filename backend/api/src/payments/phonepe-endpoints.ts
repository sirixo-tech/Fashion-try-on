import { PaymentProviderError } from "./payment-diagnostics.js";

export const phonePeUatBase =
  "https://mercury-uat.phonepe.com/enterprise-sandbox";

// The production v3 base must be confirmed with PhonePe for the merchant.
// Never infer it from a Salt Key or accept endpoints from Store/browser input.
export function validatePhonePeProductionBase(value: string | undefined) {
  try {
    const raw = value?.trim().replace(/\/+$/, "") ?? "";
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".phonepe.com") ||
      /uat|sandbox|preprod/i.test(url.hostname + url.pathname) ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      !/^(?:\/[A-Za-z0-9_-]+)*$/.test(
        url.pathname === "/" ? "" : url.pathname,
      ) ||
      url.pathname.endsWith("/v3") ||
      url.href.replace(/\/+$/, "") !== raw
    )
      throw new Error();
    return raw;
  } catch {
    throw new PaymentProviderError("PRODUCTION_ENDPOINT_UNCONFIGURED");
  }
}

export function phonePeProductionBase() {
  return validatePhonePeProductionBase(
    process.env.SELFX_PHONEPE_PRODUCTION_BASE_URL,
  );
}
export function phonePeProductionReady() {
  try {
    phonePeProductionBase();
    return true;
  } catch {
    return false;
  }
}
