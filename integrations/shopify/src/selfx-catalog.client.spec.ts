import { describe, expect, it, vi } from "vitest";

import { SelfxCatalogClient } from "./selfx-catalog.client.js";

describe("SelfxCatalogClient", () => {
  it("submits normalized data with only the SelfX integration token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          direction: "COMMERCE_TO_SELFX",
          sourceOfTruth: "COMMERCE_PLATFORM",
          finalized: true,
          created: 0,
          updated: 0,
          archived: 0,
          ignoredAsStale: 0,
          processedAt: "2026-09-07T10:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = new SelfxCatalogClient({
      apiBaseUrl: "https://api.selfx.test",
      integrationToken: "selfx-shopify-token",
      fetchImpl,
    });

    await client.sync({
      mode: "FULL",
      sourceSnapshotAt: "2026-09-07T09:00:00.000Z",
      finalize: true,
      products: [],
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.selfx.test/api/v1/integrations/catalog/sync",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-selfx-integration-token": "selfx-shopify-token",
        },
      }),
    );
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain(
      "X-Shopify-Access-Token",
    );
  });
});
