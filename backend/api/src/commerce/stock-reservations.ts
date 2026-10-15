import { Prisma } from "@prisma/client";

// Reservations are live order lines, not a mutable counter. Expired holds stop
// reducing availability at their deadline even if the background job is down.
export async function reservedQuantities(
  tx: Prisma.TransactionClient,
  storeId: string,
  variantIds: string[],
  now = new Date(),
) {
  if (!variantIds.length) return new Map<string, number>();
  const rows = await tx.$queryRaw<
    Array<{ variant_id: string; reserved: bigint }>
  >(Prisma.sql`
    SELECT i.variant_id, SUM(i.quantity)::bigint AS reserved
    FROM shopping_order_items i INNER JOIN shopping_orders o ON o.id = i.order_id AND o.organization_id = i.organization_id
    WHERE i.organization_id = ${storeId}::uuid AND i.variant_id IN (${Prisma.join(variantIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND o.status IN ('AWAITING_PAYMENT','PAYMENT_PENDING') AND o.expires_at > ${now}
    GROUP BY i.variant_id
  `);
  return new Map(rows.map((row) => [row.variant_id, Number(row.reserved)]));
}
