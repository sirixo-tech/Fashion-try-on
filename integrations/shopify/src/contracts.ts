export type CommerceProductStatus = "ACTIVE" | "DRAFT" | "ARCHIVED";

export type SelfxCatalogVariant = {
  externalVariantId: string;
  sku: string | null;
  title: string | null;
  priceAmountCents: number | null;
  priceCurrency: string | null;
  imageUrl: string | null;
  available: boolean;
};

export type SelfxCatalogProduct = {
  externalProductId: string;
  title: string;
  handle: string | null;
  description: string | null;
  status: CommerceProductStatus;
  productUrl: string | null;
  featuredImageUrl: string | null;
  priceAmountCents: number | null;
  priceCurrency: string | null;
  sourceUpdatedAt: string;
  variants: SelfxCatalogVariant[];
};

export type SelfxCatalogSyncRequest = {
  mode: "INCREMENTAL" | "FULL";
  sourceSnapshotAt?: string;
  finalize?: boolean;
  products: SelfxCatalogProduct[];
};

export type SelfxCatalogSyncResponse = {
  direction: "COMMERCE_TO_SELFX";
  sourceOfTruth: "COMMERCE_PLATFORM";
  finalized: boolean;
  created: number;
  updated: number;
  archived: number;
  ignoredAsStale: number;
  processedAt: string;
};

export type ShopifyVariant = {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  availableForSale: boolean;
  image: { url: string } | null;
};

export type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  description: string;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT" | "UNLISTED";
  updatedAt: string;
  onlineStoreUrl: string | null;
  featuredMedia: {
    preview: { image: { url: string } | null } | null;
  } | null;
  variants: ShopifyVariant[];
};

export type ShopifyProductPage = {
  currencyCode: string;
  products: ShopifyProduct[];
  endCursor: string | null;
  hasNextPage: boolean;
};

export type ShopifyProductResult = {
  currencyCode: string;
  product: ShopifyProduct | null;
};

export type ShopifyShopIdentity = {
  id: string;
  name: string;
  myshopifyDomain: string;
};
