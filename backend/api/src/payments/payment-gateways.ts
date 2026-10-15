// Setup support is distinct from permission to take money. New connectors must
// complete account verification and the durable payment workflow before checkout.
export const PAYMENT_GATEWAYS = [
  { provider: "PHONEPE", name: "PhonePe", setupAvailable: true },
  { provider: "RAZORPAY", name: "Razorpay", setupAvailable: false },
  { provider: "STRIPE", name: "Stripe", setupAvailable: false },
  { provider: "PAYTM", name: "Paytm", setupAvailable: false },
  { provider: "PAYPAL", name: "PayPal", setupAvailable: false },
] as const;
export type PaymentProvider = (typeof PAYMENT_GATEWAYS)[number]["provider"];
export const PAYMENT_PROVIDERS = PAYMENT_GATEWAYS.map((item) => item.provider);
export const PAYMENT_ENVIRONMENTS = [
  "UNCONFIRMED",
  "UAT",
  "PRODUCTION",
] as const;
export type PaymentEnvironment = (typeof PAYMENT_ENVIRONMENTS)[number];
