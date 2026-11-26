import type { Prisma } from "@prisma/client";
import { ApiErrorException } from "../common/api-error.exception.js";

export function phonepeManaged(metadata: Prisma.JsonValue | null) {
  return (
    !!metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    metadata.billingProvider === "PHONEPE"
  );
}

export async function assertPhonePeUsageSettled(
  tx: Pick<Prisma.TransactionClient, "storeBillingCycle">,
  organizationId: string,
) {
  const due = await tx.storeBillingCycle.findFirst({
    where: {
      organizationId,
      billingProvider: "PHONEPE",
      periodEnd: { lte: new Date() },
      generations: { some: { coverage: "POSTPAID" } },
      OR: [
        { purchase: { is: null } },
        { purchase: { is: { status: { not: "PAID" } } } },
      ],
    },
  });
  if (due)
    throw new ApiErrorException(
      402,
      "STORE_USAGE_PAYMENT_DUE",
      "Pay this Store's completed usage bill in Billing to continue Try-On.",
    );
}
