import {
  KIOSK_CUSTOMER_UPLOAD_TTL_SECONDS,
  KIOSK_PAIRING_TTL_SECONDS,
} from "./kiosk.constants.js";

export interface KioskConfig {
  pairingCodePepper: string;
  provisioningSecretPepper: string;
  deviceRefreshTokenPepper: string;
  customerUploadTokenPepper: string;
  deviceJwtSecret: string;
  publicWebBaseUrl: string;
  pairingTtlSeconds: number;
  customerUploadTtlSeconds: number;
  deviceAccessTokenTtlSeconds: number;
  deviceRefreshSessionTtlSeconds: number;
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value.trim() === "") {
    throw new Error(`${key} is required`);
  }
  return value;
}

function readPositiveInt(
  env: NodeJS.ProcessEnv,
  key: string,
  minimum = 1,
): number {
  const raw = requireEnv(env, key);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${key} must be an integer >= ${minimum}`);
  }
  return value;
}

function ensureSecretQuality(key: string, value: string): void {
  if (value.length < 32) {
    throw new Error(`${key} must be at least 32 characters`);
  }
}

export function loadKioskConfig(env = process.env): KioskConfig {
  const pairingCodePepper = requireEnv(env, "KIOSK_PAIRING_CODE_PEPPER");
  const provisioningSecretPepper = requireEnv(
    env,
    "KIOSK_PROVISIONING_SECRET_PEPPER",
  );
  const deviceRefreshTokenPepper = requireEnv(
    env,
    "KIOSK_DEVICE_REFRESH_TOKEN_PEPPER",
  );
  const customerUploadTokenPepper = requireEnv(
    env,
    "KIOSK_CUSTOMER_UPLOAD_TOKEN_PEPPER",
  );
  const deviceJwtSecret = requireEnv(env, "KIOSK_DEVICE_JWT_SECRET");
  const publicWebBaseUrl = requireEnv(env, "SELFX_PUBLIC_WEB_BASE_URL").replace(
    /\/+$/,
    "",
  );

  ensureSecretQuality("KIOSK_PAIRING_CODE_PEPPER", pairingCodePepper);
  ensureSecretQuality(
    "KIOSK_PROVISIONING_SECRET_PEPPER",
    provisioningSecretPepper,
  );
  ensureSecretQuality(
    "KIOSK_DEVICE_REFRESH_TOKEN_PEPPER",
    deviceRefreshTokenPepper,
  );
  ensureSecretQuality(
    "KIOSK_CUSTOMER_UPLOAD_TOKEN_PEPPER",
    customerUploadTokenPepper,
  );
  ensureSecretQuality("KIOSK_DEVICE_JWT_SECRET", deviceJwtSecret);
  if (!/^https?:\/\//.test(publicWebBaseUrl)) {
    throw new Error("SELFX_PUBLIC_WEB_BASE_URL must be an absolute URL");
  }

  const pairingTtlSeconds = readPositiveInt(env, "KIOSK_PAIRING_TTL_SECONDS");
  if (pairingTtlSeconds !== KIOSK_PAIRING_TTL_SECONDS) {
    throw new Error("KIOSK_PAIRING_TTL_SECONDS must be 480");
  }

  const customerUploadTtlSeconds = readPositiveInt(
    env,
    "KIOSK_CUSTOMER_UPLOAD_TTL_SECONDS",
  );
  if (customerUploadTtlSeconds !== KIOSK_CUSTOMER_UPLOAD_TTL_SECONDS) {
    throw new Error("KIOSK_CUSTOMER_UPLOAD_TTL_SECONDS must be 300");
  }

  return {
    pairingCodePepper,
    provisioningSecretPepper,
    deviceRefreshTokenPepper,
    customerUploadTokenPepper,
    deviceJwtSecret,
    publicWebBaseUrl,
    pairingTtlSeconds,
    customerUploadTtlSeconds,
    deviceAccessTokenTtlSeconds: readPositiveInt(
      env,
      "KIOSK_DEVICE_ACCESS_TOKEN_TTL_SECONDS",
    ),
    deviceRefreshSessionTtlSeconds: readPositiveInt(
      env,
      "KIOSK_DEVICE_REFRESH_SESSION_TTL_SECONDS",
    ),
  };
}
