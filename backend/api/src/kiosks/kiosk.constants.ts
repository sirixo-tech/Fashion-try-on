export const KIOSK_CONFIG = Symbol("KIOSK_CONFIG");

export const KIOSK_ERROR_CODES = {
  pairingInvalid: "KIOSK_PAIRING_INVALID",
  pairingExpired: "KIOSK_PAIRING_EXPIRED",
  pairingAlreadyClaimed: "KIOSK_PAIRING_ALREADY_CLAIMED",
  provisioningSecretInvalid: "KIOSK_PROVISIONING_SECRET_INVALID",
  provisioningGrantInvalid: "KIOSK_PROVISIONING_GRANT_INVALID",
  provisioningGrantConsumed: "KIOSK_PROVISIONING_GRANT_CONSUMED",
  deviceTokenInvalid: "DEVICE_TOKEN_INVALID",
  deviceTokenExpired: "DEVICE_TOKEN_EXPIRED",
  deviceRevoked: "DEVICE_REVOKED",
  deviceUnpaired: "DEVICE_UNPAIRED",
  assignmentInvalid: "KIOSK_ASSIGNMENT_INVALID",
  rateLimited: "KIOSK_RATE_LIMITED",
} as const;

export const KIOSK_AUDIT_ACTIONS = {
  paired: "KIOSK_PAIRED",
  revoked: "KIOSK_REVOKED",
  heartbeat: "KIOSK_HEARTBEAT",
} as const;

export const KIOSK_PAIRING_CODE_PATTERN = /^\d{6}$/;
export const KIOSK_PAIRING_TTL_SECONDS = 480;
export const KIOSK_PAIRING_STATUS_POLL_SECONDS = 3;
export const KIOSK_DEVICE_REFRESH_TOKEN_BYTES = 48;
export const KIOSK_PROVISIONING_SECRET_BYTES = 32;
