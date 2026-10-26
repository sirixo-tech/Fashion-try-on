import { ApiErrorException } from "../common/api-error.exception.js";

export const CUSTOMER_TERMS_VERSION = "2026-10-26";
export const customerError = (
  code: string,
  message: string,
  status = 400,
): never => {
  throw new ApiErrorException(status, code, message);
};
export function customerConfig(env: NodeJS.ProcessEnv = process.env) {
  const enabled = env.SELFX_CUSTOMER_AUTH_ENABLED === "true";
  const secret = env.SELFX_CUSTOMER_JWT_SECRET ?? "";
  if (enabled && secret === env.JWT_ACCESS_SECRET)
    throw new Error("Customer and dashboard JWT secrets must be different.");
  if (
    enabled &&
    (secret.length < 32 ||
      (env.NODE_ENV === "production" && /CHANGE_ME|local_dev_/i.test(secret)))
  )
    throw new Error(
      "SELFX_CUSTOMER_JWT_SECRET must be a dedicated secret of at least 32 characters.",
    );
  return {
    enabled,
    secret,
    googleClientIds: (env.SELFX_CUSTOMER_GOOGLE_CLIENT_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    appleClientIds: (env.SELFX_CUSTOMER_APPLE_CLIENT_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    accessSeconds: 600,
    refreshDays: 30,
  };
}
