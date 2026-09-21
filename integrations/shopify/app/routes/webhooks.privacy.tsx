import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { processShopifyPrivacyWebhook } from "../shopify-privacy-webhook.server";
import { authenticate } from "../shopify.server";
import { forwardShopifyWebhookToSelfx } from "../selfx-webhook-forwarder.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const rawBody = await request.clone().arrayBuffer();
  const { shop } = await authenticate.webhook(request);

  return processShopifyPrivacyWebhook({
    request,
    rawBody,
    shop,
    forward: forwardShopifyWebhookToSelfx,
    deleteLocalShopData: async (shopDomain) => {
      await db.$transaction([
        db.session.deleteMany({ where: { shop: shopDomain } }),
        db.selfxConnection.deleteMany({ where: { shop: shopDomain } }),
      ]);
    },
  });
};
