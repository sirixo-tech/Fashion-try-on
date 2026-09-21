export async function processShopifyPrivacyWebhook(input: {
  request: Request;
  rawBody: ArrayBuffer;
  shop: string;
  forward: (input: {
    request: Request;
    rawBody: ArrayBuffer;
  }) => Promise<Response>;
  deleteLocalShopData: (shop: string) => Promise<void>;
}): Promise<Response> {
  const response = await input.forward({
    request: input.request,
    rawBody: input.rawBody,
  });
  if (!response.ok) return response;

  if (input.request.headers.get("x-shopify-topic") === "shop/redact") {
    try {
      await input.deleteLocalShopData(input.shop);
    } catch {
      return new Response(null, { status: 503 });
    }
  }

  return response;
}
