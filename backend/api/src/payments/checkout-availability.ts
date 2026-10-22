import type { Prisma } from "@prisma/client";
import { paymentCallbackOrigin } from "./payment-execution-utils.js";
import { phonePeProductionReady } from "./phonepe-endpoints.js";

export function paymentEnvironmentEnabled(environment: string) {
  try {
    paymentCallbackOrigin();
  } catch {
    return false;
  }
  return environment === "PRODUCTION"
    ? process.env.SELFX_PHONEPE_CHECKOUT_ENABLED === "true" &&
        phonePeProductionReady()
    : environment === "UAT" && process.env.SELFX_PHONEPE_UAT_ENABLED === "true";
}

export async function checkoutAvailable(
  db: Pick<
    Prisma.TransactionClient,
    "storePaymentSettings" | "storePaymentConnection" | "paymentGatewayPolicy"
  >,
  organizationId: string,
) {
  const [settings, connection, policy] = await Promise.all([
    db.storePaymentSettings.findUnique({ where: { organizationId } }),
    db.storePaymentConnection.findUnique({
      where: {
        organizationId_provider: { organizationId, provider: "PHONEPE" },
      },
    }),
    db.paymentGatewayPolicy.findUnique({ where: { provider: "PHONEPE" } }),
  ]);
  return (
    settings?.selectedProvider === "PHONEPE" &&
    policy?.enabled === true &&
    connection?.dqrAccessConfirmed === true &&
    paymentEnvironmentEnabled(connection.environment)
  );
}
