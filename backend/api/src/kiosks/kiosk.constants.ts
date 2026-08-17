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
  deviceInactive: "DEVICE_INACTIVE",
  deviceRevoked: "DEVICE_REVOKED",
  deviceDeleted: "DEVICE_DELETED",
  deviceUnpaired: "DEVICE_UNPAIRED",
  deviceUpdateInvalid: "KIOSK_DEVICE_UPDATE_INVALID",
  assignmentInvalid: "KIOSK_ASSIGNMENT_INVALID",
  customerUploadInvalid: "KIOSK_CUSTOMER_UPLOAD_INVALID",
  customerUploadExpired: "KIOSK_CUSTOMER_UPLOAD_EXPIRED",
  customerUploadNotReady: "KIOSK_CUSTOMER_UPLOAD_NOT_READY",
  customerUploadPurposeMismatch: "KIOSK_CUSTOMER_UPLOAD_PURPOSE_MISMATCH",
  customerUploadRejected: "KIOSK_CUSTOMER_UPLOAD_REJECTED",
  configurationInvalid: "KIOSK_CONFIGURATION_INVALID",
  rateLimited: "KIOSK_RATE_LIMITED",
} as const;

export const KIOSK_AUDIT_ACTIONS = {
  paired: "KIOSK_PAIRED",
  activated: "KIOSK_ACTIVATED",
  deactivated: "KIOSK_DEACTIVATED",
  revoked: "KIOSK_REVOKED",
  unpaired: "KIOSK_UNPAIRED",
  deleted: "KIOSK_DELETED",
  heartbeat: "KIOSK_HEARTBEAT",
  updated: "KIOSK_UPDATED",
  configured: "KIOSK_CONFIGURED",
} as const;

export const KIOSK_PAIRING_CODE_PATTERN = /^\d{6}$/;
export const KIOSK_PAIRING_TTL_SECONDS = 480;
export const KIOSK_CUSTOMER_UPLOAD_TTL_SECONDS = 300;
export const KIOSK_CUSTOMER_UPLOAD_TOKEN_BYTES = 32;
export const KIOSK_CUSTOMER_UPLOAD_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const KIOSK_CUSTOMER_UPLOAD_SIGNED_URL_MAX_TTL_SECONDS = 300;
export const KIOSK_CUSTOMER_UPLOAD_POLL_INTERVAL_SECONDS = 3;
export const KIOSK_PAIRING_STATUS_POLL_SECONDS = 3;
export const KIOSK_DEVICE_REFRESH_TOKEN_BYTES = 48;
export const KIOSK_PROVISIONING_SECRET_BYTES = 32;
