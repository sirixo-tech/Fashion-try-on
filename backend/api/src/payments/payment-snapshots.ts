import type { ShoppingPaymentAttempt } from "@prisma/client";
import { decryptProviderSecret } from "../integrations/provider-secret-cipher.js";
import { paymentEncryptionKey } from "./payment-settings.service.js";
import {
  PhonePeDqrAdapter,
  type PhonePeDqrCredentials,
} from "./phonepe-dqr.adapter.js";
export function attemptAdapter(attempt: ShoppingPaymentAttempt) {
  const snapshot = decryptPaymentSnapshot<
    PhonePeDqrCredentials & { organizationId: string; provider: string }
  >(attempt);
  if (
    snapshot.organizationId !== attempt.organizationId ||
    snapshot.provider !== attempt.provider ||
    snapshot.environment !== attempt.environment
  )
    throw new Error("Payment connection snapshot does not match the order.");
  return new PhonePeDqrAdapter(snapshot);
}

export function decryptPaymentSnapshot<T>(
  attempt: Pick<
    ShoppingPaymentAttempt,
    | "encryptedPayload"
    | "initializationVector"
    | "authenticationTag"
    | "keyVersion"
  >,
): T {
  const current = paymentEncryptionKey();
  let key = current.key;
  if (attempt.keyVersion !== current.version) {
    const previous = JSON.parse(
      process.env.SELFX_PAYMENT_PREVIOUS_ENCRYPTION_KEYS?.trim() || "{}",
    );
    const encoded = previous[attempt.keyVersion];
    if (typeof encoded !== "string")
      throw new Error("Payment encryption key version unavailable.");
    key = Buffer.from(encoded, "base64");
    if (key.length !== 32 || key.toString("base64") !== encoded)
      throw new Error("Invalid payment encryption key.");
  }
  return decryptProviderSecret<T>(attempt, key);
}
