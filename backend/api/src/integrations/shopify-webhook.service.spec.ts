import { createHmac } from "node:crypto";

import { IntegrationEventStatus, IntegrationStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ShopifyWebhookService,
  verifyShopifyWebhookHmac,
  type ShopifyWebhookRequest,
} from "./shopify-webhook.service.js";

const secret = "shopify-client-secret";

describe("Shopify webhook security and synchronization", () => {
  beforeEach(() => {
    vi.stubEnv("SHOPIFY_CLIENT_ID", "client-id");
    vi.stubEnv("SHOPIFY_CLIENT_SECRET", secret);
    vi.stubEnv(
      "SELFX_INTEGRATION_ENCRYPTION_KEY",
      Buffer.alloc(32, 7).toString("base64"),
    );
    vi.stubEnv("SELFX_API_BASE_URL", "https://api.selfx.test");
    vi.stubEnv("SELFX_WEB_BASE_URL", "https://app.selfx.test");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("verifies the exact raw body and rejects a changed body", () => {
    const body = Buffer.from('{"id":123}');
    const signature = sign(body);

    expect(verifyShopifyWebhookHmac(body, signature, secret)).toBe(true);
    expect(
      verifyShopifyWebhookHmac(Buffer.from('{"id":124}'), signature, secret),
    ).toBe(false);
  });

  it("fetches and imports the complete product for an update webhook", async () => {
    const { prisma, eventUpdate } = prismaMock();
    const getProduct = vi.fn().mockResolvedValue({
      currencyCode: "USD",
      product: shopifyProduct(),
    });
    const oauth = {
      webhookConnection: vi
        .fn()
        .mockResolvedValue(connection({ client: { getProduct } })),
    };
    const sync = vi.fn().mockResolvedValue({});
    const service = new ShopifyWebhookService(
      prisma as never,
      oauth as never,
      { sync } as never,
    );

    await expect(
      service.handle(
        request("products/update", {
          id: 123,
          admin_graphql_api_id: "gid://shopify/Product/123",
        }),
      ),
    ).resolves.toEqual({ accepted: true });

    expect(getProduct).toHaveBeenCalledWith("gid://shopify/Product/123");
    expect(sync).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: "integration-1",
        storeId: "store-1",
      }),
      expect.objectContaining({
        mode: "INCREMENTAL",
        products: [
          expect.objectContaining({
            externalProductId: "gid://shopify/Product/123",
            title: "Black Tee",
            status: "ACTIVE",
          }),
        ],
      }),
    );
    expect(eventUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: IntegrationEventStatus.PROCESSED,
        }),
      }),
    );
  });

  it("does not process a completed customer data request twice", async () => {
    const { prisma } = prismaMock({ duplicate: true });
    const oauth = {
      webhookConnection: vi.fn().mockResolvedValue(connection()),
    };
    const sync = vi.fn();
    const service = new ShopifyWebhookService(
      prisma as never,
      oauth as never,
      { sync } as never,
    );

    await expect(
      service.handle(request("customers/data_request", customerDataRequest())),
    ).resolves.toEqual({ accepted: true, duplicate: true });
    expect(sync).not.toHaveBeenCalled();
  });

  it("records a customer data request without retaining customer data", async () => {
    const { prisma, eventCreate } = prismaMock();
    const oauth = {
      webhookConnection: vi.fn().mockResolvedValue(connection()),
    };
    const service = new ShopifyWebhookService(
      prisma as never,
      oauth as never,
      {} as never,
    );

    await expect(
      service.handle(request("customers/data_request", customerDataRequest())),
    ).resolves.toEqual({ accepted: true });

    expect(oauth.webhookConnection).toHaveBeenCalledWith(
      "demo.myshopify.com",
      false,
    );
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "customers/data_request",
          payload: {
            apiVersion: "2026-07",
            triggeredAt: "2026-09-07T10:00:00.000Z",
            outcome: "NO_CUSTOMER_DATA_STORED",
          },
        }),
      }),
    );
    const stored = JSON.stringify(eventCreate.mock.calls[0]?.[0]);
    expect(stored).not.toContain("demo.myshopify.com");
    expect(stored).not.toContain("954889");
    expect(stored).not.toContain("191167");
    expect(stored).not.toContain("customer@example.com");
    expect(stored).not.toContain("555-0100");
    expect(stored).not.toContain("299938");
    expect(stored).not.toContain("9999");
  });

  it("accepts an email-only Shopify customer data request", async () => {
    const { prisma } = prismaMock();
    const oauth = {
      webhookConnection: vi
        .fn()
        .mockResolvedValue(
          connection({ status: IntegrationStatus.DISCONNECTED }),
        ),
    };
    const service = new ShopifyWebhookService(
      prisma as never,
      oauth as never,
      {} as never,
    );
    const payload = customerDataRequest();
    payload.customer = { email: "customer@example.com" };

    await expect(
      service.handle(request("customers/data_request", payload)),
    ).resolves.toEqual({ accepted: true });
  });

  it("rejects a malformed customer data request before persistence", async () => {
    const { prisma, eventCreate } = prismaMock();
    const oauth = { webhookConnection: vi.fn() };
    const service = new ShopifyWebhookService(
      prisma as never,
      oauth as never,
      {} as never,
    );
    const payload = customerDataRequest();
    payload.customer = {};

    await expect(
      service.handle(request("customers/data_request", payload)),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        error: {
          code: "SHOPIFY_WEBHOOK_REQUEST_INVALID",
          message: "Shopify customer data request payload is invalid.",
        },
      },
    });
    expect(oauth.webhookConnection).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("rejects a customer data request with an invalid HMAC", async () => {
    const { prisma, eventCreate } = prismaMock();
    const oauth = { webhookConnection: vi.fn() };
    const service = new ShopifyWebhookService(
      prisma as never,
      oauth as never,
      {} as never,
    );
    const webhook = request("customers/data_request", customerDataRequest());
    webhook.headers["x-shopify-hmac-sha256"] = "invalid";

    await expect(service.handle(webhook)).rejects.toMatchObject({
      status: 401,
    });
    expect(oauth.webhookConnection).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("records a customer redaction without retaining customer data", async () => {
    const { prisma, eventCreate, eventUpdate } = prismaMock();
    const oauth = {
      webhookConnection: vi.fn().mockResolvedValue(connection()),
    };
    const service = new ShopifyWebhookService(
      prisma as never,
      oauth as never,
      {} as never,
    );

    await expect(
      service.handle(request("customers/redact", customerRedact())),
    ).resolves.toEqual({ accepted: true });

    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "customers/redact",
          payload: {
            apiVersion: "2026-07",
            triggeredAt: "2026-09-07T10:00:00.000Z",
            outcome: "NO_CUSTOMER_DATA_STORED",
          },
        }),
      }),
    );
    expect(eventUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: IntegrationEventStatus.PROCESSED,
        }),
      }),
    );
    const stored = JSON.stringify(eventCreate.mock.calls[0]?.[0]);
    expect(stored).not.toContain("demo.myshopify.com");
    expect(stored).not.toContain("954889");
    expect(stored).not.toContain("191167");
    expect(stored).not.toContain("customer@example.com");
    expect(stored).not.toContain("555-0100");
    expect(stored).not.toContain("299938");
  });

  it("does not process a completed customer redaction twice", async () => {
    const { prisma, eventUpdate } = prismaMock({ duplicate: true });
    const oauth = {
      webhookConnection: vi.fn().mockResolvedValue(connection()),
    };
    const service = new ShopifyWebhookService(
      prisma as never,
      oauth as never,
      {} as never,
    );

    await expect(
      service.handle(request("customers/redact", customerRedact())),
    ).resolves.toEqual({ accepted: true, duplicate: true });
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("redacts Shopify shop data without retaining the shop payload", async () => {
    const { prisma, eventCreate, eventUpdate } = prismaMock();
    const oauth = {
      webhookConnection: vi
        .fn()
        .mockResolvedValue(
          connection({ status: IntegrationStatus.DISCONNECTED }),
        ),
    };
    const redact = vi.fn().mockResolvedValue(undefined);
    const service = new ShopifyWebhookService(
      prisma as never,
      oauth as never,
      {} as never,
      { redact } as never,
    );

    await expect(
      service.handle(
        request("shop/redact", {
          shop_id: 954889,
          shop_domain: "demo.myshopify.com",
        }),
      ),
    ).resolves.toEqual({ accepted: true });

    expect(redact).toHaveBeenCalledWith({
      connection: expect.objectContaining({ integrationId: "integration-1" }),
      eventId: expect.any(String),
      webhookId: "webhook-1",
      triggeredAt: new Date("2026-09-07T10:00:00.000Z"),
      apiVersion: "2026-07",
      shopDomain: "demo.myshopify.com",
    });
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "shop/redact",
          payload: {
            apiVersion: "2026-07",
            triggeredAt: "2026-09-07T10:00:00.000Z",
            outcome: "SHOP_DATA_REDACTION_PENDING",
          },
        }),
      }),
    );
    expect(JSON.stringify(eventCreate.mock.calls[0]?.[0])).not.toContain(
      "demo.myshopify.com",
    );
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("rejects a malformed shop redaction before persistence", async () => {
    const { prisma, eventCreate } = prismaMock();
    const oauth = { webhookConnection: vi.fn() };
    const service = new ShopifyWebhookService(
      prisma as never,
      oauth as never,
      {} as never,
      { redact: vi.fn() } as never,
    );

    await expect(
      service.handle(
        request("shop/redact", {
          shop_id: 0,
          shop_domain: "another.myshopify.com",
        }),
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        error: {
          code: "SHOPIFY_WEBHOOK_REQUEST_INVALID",
          message: "Shopify shop redaction payload is invalid.",
        },
      },
    });
    expect(oauth.webhookConnection).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("rejects a malformed customer redaction before persistence", async () => {
    const { prisma, eventCreate } = prismaMock();
    const oauth = { webhookConnection: vi.fn() };
    const service = new ShopifyWebhookService(
      prisma as never,
      oauth as never,
      {} as never,
    );
    const payload = customerRedact();
    payload.orders_to_redact = "not-an-array";

    await expect(
      service.handle(request("customers/redact", payload)),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        error: {
          code: "SHOPIFY_WEBHOOK_REQUEST_INVALID",
          message: "Shopify customer redaction payload is invalid.",
        },
      },
    });
    expect(oauth.webhookConnection).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("archives the local product reference for a delete webhook", async () => {
    const { prisma } = prismaMock();
    const oauth = {
      webhookConnection: vi.fn().mockResolvedValue(connection()),
    };
    const sync = vi.fn().mockResolvedValue({});
    const service = new ShopifyWebhookService(
      prisma as never,
      oauth as never,
      { sync } as never,
    );

    await service.handle(request("products/delete", { id: 123 }));

    expect(sync).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        products: [
          expect.objectContaining({
            externalProductId: "gid://shopify/Product/123",
            status: "ARCHIVED",
          }),
        ],
      }),
    );
    expect(oauth.webhookConnection).toHaveBeenCalledWith(
      "demo.myshopify.com",
      false,
    );
  });

  it("disconnects and archives the integration after app uninstall", async () => {
    const transaction = {
      integrationProviderCredential: { deleteMany: vi.fn() },
      integrationOauthState: { deleteMany: vi.fn() },
      integrationCredential: { updateMany: vi.fn() },
      integration: { update: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const { prisma } = prismaMock({ transaction });
    const oauth = {
      webhookConnection: vi.fn().mockResolvedValue(connection()),
    };
    const archiveIntegrationCatalog = vi.fn().mockResolvedValue(3);
    const service = new ShopifyWebhookService(
      prisma as never,
      oauth as never,
      { archiveIntegrationCatalog } as never,
    );

    await service.handle(request("app/uninstalled", { id: 456 }));

    expect(transaction.integration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: IntegrationStatus.DISCONNECTED,
        }),
      }),
    );
    expect(
      transaction.integrationProviderCredential.deleteMany,
    ).toHaveBeenCalled();
    expect(transaction.integrationCredential.updateMany).toHaveBeenCalled();
    expect(archiveIntegrationCatalog).toHaveBeenCalledWith(
      "integration-1",
      expect.any(Date),
    );
  });
});

function request(
  topic: string,
  payload: Record<string, unknown>,
): ShopifyWebhookRequest {
  const rawBody = Buffer.from(JSON.stringify(payload));
  return {
    rawBody,
    headers: {
      "x-shopify-hmac-sha256": sign(rawBody),
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": "demo.myshopify.com",
      "x-shopify-webhook-id": "webhook-1",
      "x-shopify-triggered-at": "2026-09-07T10:00:00.000Z",
      "x-shopify-api-version": "2026-07",
    },
  };
}

function sign(body: Buffer): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

function connection(overrides: Record<string, unknown> = {}) {
  return {
    integrationId: "integration-1",
    storeId: "store-1",
    storeName: "Demo Store",
    externalAccountId: "gid://shopify/Shop/456",
    externalAccountName: "Demo Shop",
    status: IntegrationStatus.ACTIVE,
    client: null,
    ...overrides,
  };
}

function prismaMock(options?: {
  duplicate?: boolean;
  transaction?: Record<string, unknown>;
}) {
  const eventUpdate = vi.fn().mockResolvedValue({});
  const eventCreate = options?.duplicate
    ? vi.fn().mockRejectedValue({ code: "P2002" })
    : vi.fn().mockResolvedValue({});
  const integrationEvent = {
    create: eventCreate,
    findUniqueOrThrow: vi.fn().mockResolvedValue({
      id: "existing-event",
      status: IntegrationEventStatus.PROCESSED,
      updatedAt: new Date(),
    }),
    update: eventUpdate,
  };
  return {
    eventCreate,
    eventUpdate,
    prisma: {
      integrationEvent,
      $transaction: vi.fn(
        (callback: (tx: Record<string, unknown>) => Promise<unknown>) =>
          callback(options?.transaction ?? {}),
      ),
    },
  };
}

function customerDataRequest(): Record<string, unknown> {
  return {
    shop_id: 954889,
    shop_domain: "demo.myshopify.com",
    orders_requested: [299938],
    customer: {
      id: 191167,
      email: "customer@example.com",
      phone: "555-0100",
    },
    data_request: { id: 9999 },
  };
}

function customerRedact(): Record<string, unknown> {
  return {
    shop_id: 954889,
    shop_domain: "demo.myshopify.com",
    customer: {
      id: 191167,
      email: "customer@example.com",
      phone: "555-0100",
    },
    orders_to_redact: [299938],
  };
}

function shopifyProduct() {
  return {
    id: "gid://shopify/Product/123",
    title: "Black Tee",
    handle: "black-tee",
    description: "A black tee",
    status: "ACTIVE" as const,
    tags: ["selfx-tryon"],
    updatedAt: "2026-09-07T09:59:00.000Z",
    onlineStoreUrl: "https://demo.example/products/black-tee",
    featuredMedia: null,
    variants: [
      {
        id: "gid://shopify/ProductVariant/789",
        title: "Medium",
        sku: "TEE-M",
        price: "29.99",
        availableForSale: true,
        image: null,
      },
    ],
  };
}
