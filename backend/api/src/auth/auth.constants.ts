export const AUTH_REPOSITORY = Symbol("AUTH_REPOSITORY");
export const AUTH_CONFIG = Symbol("AUTH_CONFIG");

export const AUTH_ERROR_CODES = {
  invalidCredentials: "AUTH_INVALID_CREDENTIALS",
  userDisabled: "AUTH_USER_DISABLED",
  accessTokenInvalid: "AUTH_ACCESS_TOKEN_INVALID",
  refreshTokenInvalid: "AUTH_REFRESH_TOKEN_INVALID",
  csrfRejected: "AUTH_CSRF_REJECTED",
  rateLimited: "AUTH_RATE_LIMITED",
  validationFailed: "AUTH_VALIDATION_FAILED",
} as const;

export const AUTH_AUDIT_ACTIONS = {
  loginSuccess: "AUTH_LOGIN_SUCCESS",
  loginFailed: "AUTH_LOGIN_FAILED",
  refreshSuccess: "AUTH_REFRESH_SUCCESS",
  refreshRejected: "AUTH_REFRESH_REJECTED",
  logout: "AUTH_LOGOUT",
  logoutAll: "AUTH_LOGOUT_ALL",
} as const;
