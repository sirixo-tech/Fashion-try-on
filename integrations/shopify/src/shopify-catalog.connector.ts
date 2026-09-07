import {
  type SelfxCatalogProduct,
  type SelfxCatalogSyncResponse,
  type ShopifyProductPage,
} from "./contracts.js";
import { mapShopifyProduct } from "./shopify-product.mapper.js";

export type ShopifyCatalogSyncReport = {
  source: "SHOPIFY";
  direction: "SHOPIFY_TO_SELFX";
  sourceSnapshotAt: string;
  productsRead: number;
  variantsRead: number;
  submittedBatches: number;
  created: number;
  updated: number;
  archived: number;
  ignoredAsStale: number;
  completedAt: string;
};

type ShopifyReader = {
  listProductsPage(after: string | null): Promise<ShopifyProductPage>;
};

type SelfxWriter = {
  sync(input: {
    mode: "FULL";
    sourceSnapshotAt: string;
    finalize: boolean;
    products: SelfxCatalogProduct[];
  }): Promise<SelfxCatalogSyncResponse>;
};

export class ShopifyCatalogConnector {
  constructor(
    private readonly shopify: ShopifyReader,
    private readonly selfx: SelfxWriter,
    private readonly batchSize: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async runFullSync(): Promise<ShopifyCatalogSyncReport> {
    const sourceSnapshotAt = this.now().toISOString();
    const totals = {
      productsRead: 0,
      variantsRead: 0,
      submittedBatches: 0,
      created: 0,
      updated: 0,
      archived: 0,
      ignoredAsStale: 0,
    };
    let cursor: string | null = null;
    let pending: SelfxCatalogProduct[] = [];

    do {
      const page = await this.shopify.listProductsPage(cursor);
      for (const product of page.products) {
        const normalized = mapShopifyProduct(product, page.currencyCode);
        pending.push(normalized);
        totals.productsRead += 1;
        totals.variantsRead += normalized.variants.length;
        if (pending.length >= this.batchSize) {
          addResponse(
            totals,
            await this.selfx.sync({
              mode: "FULL",
              sourceSnapshotAt,
              finalize: false,
              products: pending,
            }),
          );
          totals.submittedBatches += 1;
          pending = [];
        }
      }
      cursor = page.hasNextPage ? requiredCursor(page.endCursor) : null;
    } while (cursor);

    if (pending.length > 0) {
      addResponse(
        totals,
        await this.selfx.sync({
          mode: "FULL",
          sourceSnapshotAt,
          finalize: false,
          products: pending,
        }),
      );
      totals.submittedBatches += 1;
    }

    addResponse(
      totals,
      await this.selfx.sync({
        mode: "FULL",
        sourceSnapshotAt,
        finalize: true,
        products: [],
      }),
    );

    return {
      source: "SHOPIFY",
      direction: "SHOPIFY_TO_SELFX",
      sourceSnapshotAt,
      ...totals,
      completedAt: this.now().toISOString(),
    };
  }
}

function addResponse(
  totals: {
    created: number;
    updated: number;
    archived: number;
    ignoredAsStale: number;
  },
  response: SelfxCatalogSyncResponse,
): void {
  totals.created += response.created;
  totals.updated += response.updated;
  totals.archived += response.archived;
  totals.ignoredAsStale += response.ignoredAsStale;
}

function requiredCursor(cursor: string | null): string {
  if (!cursor) {
    throw new Error("Shopify returned an invalid product pagination cursor.");
  }
  return cursor;
}
