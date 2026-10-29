import { ApiErrorException } from "../common/api-error.exception.js";

export type MobilePhonePeCredentials = {
  merchantId: string;
  clientId: string;
  clientVersion: string;
  clientSecret: string;
  environment: "SANDBOX" | "PRODUCTION";
};

const endpoints = {
  SANDBOX: {
    oauth: "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token",
    checkout: "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2",
  },
  PRODUCTION: {
    oauth: "https://api.phonepe.com/apis/identity-manager/v1/oauth/token",
    checkout: "https://api.phonepe.com/apis/pg/checkout/v2",
  },
} as const;

function invalid(message: string): never {
  throw new ApiErrorException(
    503,
    "MOBILE_PAYMENT_PROVIDER_UNAVAILABLE",
    message,
  );
}

async function json(
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) invalid("PhonePe could not process this payment now.");
    const raw = await response.text();
    if (raw.length > 65536) invalid("PhonePe returned an invalid response.");
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      invalid("PhonePe returned an invalid response.");
    return value as Record<string, unknown>;
  } catch {
    invalid("PhonePe is unavailable. Please try again shortly.");
  }
}

function validateCredentials(value: MobilePhonePeCredentials) {
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(value.merchantId) ||
    !/^[A-Za-z0-9_-]{1,150}$/.test(value.clientId) ||
    !/^[A-Za-z0-9_.-]{1,40}$/.test(value.clientVersion) ||
    !/^\S{8,256}$/.test(value.clientSecret) ||
    !endpoints[value.environment]
  )
    invalid("Mobile PhonePe configuration is incomplete.");
}

async function token(credentials: MobilePhonePeCredentials) {
  validateCredentials(credentials);
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    client_version: credentials.clientVersion,
    client_secret: credentials.clientSecret,
    grant_type: "client_credentials",
  });
  const response = await json(endpoints[credentials.environment].oauth, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (typeof response.access_token !== "string" || !response.access_token)
    invalid("PhonePe authentication failed.");
  return response.access_token;
}

export async function createMobileCheckout(
  credentials: MobilePhonePeCredentials,
  merchantOrderId: string,
  amountMinor: number,
) {
  if (
    !/^[A-Za-z0-9_-]{1,63}$/.test(merchantOrderId) ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 100
  )
    invalid("Invalid payment request.");
  const accessToken = await token(credentials);
  const response = await json(
    `${endpoints[credentials.environment].checkout}/pay`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `O-Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        merchantOrderId,
        amount: amountMinor,
        expireAfter: 1200,
        paymentFlow: {
          type: "PG_CHECKOUT",
          merchantUrls: { redirectUrl: "" },
          paymentModeConfig: {
            enabledPaymentModes: [{ type: "UPI_INTENT" }, { type: "UPI_QR" }],
          },
        },
      }),
    },
  );
  if (
    response.state !== "PENDING" ||
    typeof response.orderId !== "string" ||
    typeof response.redirectUrl !== "string"
  )
    invalid("PhonePe did not create a checkout.");
  let redirect: URL;
  try {
    redirect = new URL(response.redirectUrl);
  } catch {
    return invalid("PhonePe returned an invalid checkout address.");
  }
  if (
    redirect.protocol !== "https:" ||
    !redirect.hostname.endsWith(".phonepe.com") ||
    redirect.username ||
    redirect.password ||
    redirect.port
  )
    invalid("PhonePe returned an invalid checkout address.");
  return { providerOrderId: response.orderId, checkoutUrl: redirect.href };
}

export async function mobileCheckoutStatus(
  credentials: MobilePhonePeCredentials,
  merchantOrderId: string,
  amountMinor: number,
) {
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(merchantOrderId))
    invalid("Invalid payment order.");
  const accessToken = await token(credentials);
  const response = await json(
    `${endpoints[credentials.environment].checkout}/order/${merchantOrderId}/status?details=false`,
    { headers: { Authorization: `O-Bearer ${accessToken}` } },
  );
  if (
    !Number.isSafeInteger(response.amount) ||
    response.amount !== amountMinor ||
    typeof response.orderId !== "string"
  )
    invalid("PhonePe payment details did not match this order.");
  if (!["COMPLETED", "FAILED", "PENDING"].includes(String(response.state)))
    invalid("PhonePe returned an unknown payment status.");
  return {
    status: response.state as "COMPLETED" | "FAILED" | "PENDING",
    providerOrderId: response.orderId,
  };
}
