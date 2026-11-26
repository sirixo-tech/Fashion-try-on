import { createHash } from "node:crypto";
import type {
  Prisma,
  CreditLedgerChannel,
  KioskTryOnRun,
} from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { ApiErrorException } from "../common/api-error.exception.js";

/** Caller holds the Store subscription lock for every reservation/settlement. */
export async function walletBalance(
  tx: Pick<
    Prisma.TransactionClient,
    "creditLedgerEntry" | "storeCreditReservation"
  >,
  organizationId: string,
) {
  await tx.storeCreditReservation.updateMany({
    where: {
      organizationId,
      state: "RESERVED",
      OR: [
        { run: { is: { status: "FAILED" } } },
        { run: null, createdAt: { lt: new Date(Date.now() - 15 * 60_000) } },
      ],
    },
    data: { state: "RELEASED" },
  });
  const [ledger, reserved] = await Promise.all([
    tx.creditLedgerEntry.aggregate({
      where: { organizationId },
      _sum: { quantity: true },
    }),
    tx.storeCreditReservation.aggregate({
      where: { organizationId, state: "RESERVED" },
      _sum: { quantity: true },
    }),
  ]);
  return {
    availableCredits: Math.max(
      0,
      (ledger._sum.quantity ?? 0) - (reserved._sum.quantity ?? 0),
    ),
    reservedCredits: reserved._sum.quantity ?? 0,
  };
}

export async function reserveStoreCredits(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    requestKey: string;
    channel: CreditLedgerChannel;
    quantity?: number;
    allowPayg: boolean;
  },
) {
  const store = await tx.organization.findUnique({
    where: { id: input.organizationId },
    select: { status: true },
  });
  const subscription = await tx.storeSubscription.findUnique({
    where: { organizationId: input.organizationId },
  });
  if (
    store?.status !== "ACTIVE" ||
    !subscription ||
    !["ACTIVE", "TRIALING"].includes(subscription.status) ||
    !Array.isArray(subscription.channels) ||
    !subscription.channels.includes(input.channel)
  )
    throw new ApiErrorException(
      402,
      "SELFX_SUBSCRIPTION_UNAVAILABLE",
      "This Store or channel is not eligible for Try-On.",
    );
  const quantity = input.quantity ?? 1;
  const requestKey = createHash("sha256")
    .update(`credit:${input.organizationId}:${input.requestKey}`)
    .digest("hex");
  const prior = await tx.storeCreditReservation.findUnique({
    where: { requestKey },
  });
  if (prior && (prior.quantity !== quantity || prior.channel !== input.channel))
    throw new ApiErrorException(
      409,
      "CREDIT_REQUEST_CONFLICT",
      "This request was already used for another credit reservation.",
    );
  if (prior && prior.state !== "RELEASED") {
    return prior.id;
  }
  const balance = await walletBalance(tx, input.organizationId);
  if (balance.availableCredits < quantity) {
    if (input.allowPayg) return undefined;
    throw new ApiErrorException(
      402,
      "SELFX_CREDITS_EXHAUSTED",
      "Buy credits or enable Pay as you go to continue Try-On.",
    );
  }
  const row = await tx.storeCreditReservation.upsert({
    where: { requestKey },
    create: {
      id: createSelfxId(),
      organizationId: input.organizationId,
      requestKey,
      quantity,
      channel: input.channel,
    },
    update: { state: "RESERVED", createdAt: new Date() },
  });
  return row.id;
}

export async function settleStoreCredits(
  tx: Prisma.TransactionClient,
  run: KioskTryOnRun,
) {
  if (!run.creditReservationId || !run.organizationId) return;
  const reservation = await tx.storeCreditReservation.findUniqueOrThrow({
    where: { id: run.creditReservationId },
  });
  if (
    reservation.organizationId !== run.organizationId ||
    reservation.state === "RELEASED"
  )
    throw new Error("The Store credit reservation is unavailable.");
  await tx.creditLedgerEntry.createMany({
    data: [
      {
        id: createSelfxId(),
        organizationId: run.organizationId,
        entryType: "CREDIT_CONSUMED",
        channel: reservation.channel,
        quantity: -reservation.quantity,
        idempotencyKey: `store-credit-settlement:${reservation.id}`,
        kioskTryOnRunId: run.id,
        tryOnSessionId: run.tryOnSessionId,
        productId: run.productId,
        reason: "Successfully generated Try-On",
      },
    ],
    skipDuplicates: true,
  });
  await tx.storeCreditReservation.update({
    where: { id: reservation.id },
    data: { state: "CONFIRMED" },
  });
}
