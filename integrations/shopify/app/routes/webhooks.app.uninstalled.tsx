import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { Prisma } from "@selfx/shopify-prisma-client";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const triggeredAt = new Date(
    request.headers.get("x-shopify-triggered-at") ?? "",
  );
  if (!Number.isFinite(triggeredAt.getTime()))
    return new Response(null, { status: 400 });
  await db.$transaction(async (tx) => {
    const connection = await tx.selfxConnection.findUnique({ where: { shop } });
    if (connection?.linkedAt && connection.linkedAt > triggeredAt) return;
    if (connection) {
      const changed = await tx.selfxConnection.updateMany({
        where: { shop, updatedAt: connection.updatedAt },
        data: {
          status: "NOT_CONNECTED",
          pendingLinkTokenCiphertext: null,
          pendingLinkExpiresAt: null,
          integrationTokenCiphertext: null,
          selfxCredentialId: null,
          linkedAt: null,
          syncStatus: "NOT_STARTED",
          syncCheckpoint: Prisma.DbNull,
          syncLeaseToken: null,
          syncLeaseUntil: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      if (!changed.count) return;
    }
    // Store references and preferences survive; authorization does not.
    if (session) await tx.session.deleteMany({ where: { shop } });
  });

  return new Response();
};
