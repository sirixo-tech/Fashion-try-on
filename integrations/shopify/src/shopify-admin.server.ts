import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import {
  type ShopifyProductCollection,
  type ShopifyProduct,
  type ShopifyProductPage,
  type ShopifyProductResult,
  type ShopifyShopIdentity,
  type ShopifyThemeAppBlockStatus,
  type ShopifyVariant,
} from "./contracts.js";

const variantPageSize = 100;
const defaultMaxAttempts = 3;
const defaultRequestTimeoutMs = 30_000;

type PageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

type VariantConnection = {
  nodes: ShopifyVariant[];
  pageInfo: PageInfo;
};

type ProductNode = Omit<ShopifyProduct, "variants"> & {
  variants: VariantConnection;
};

type ProductsQueryData = {
  shop: { currencyCode: string };
  products: {
    nodes: ProductNode[];
    pageInfo: PageInfo;
  };
};

type ProductVariantsQueryData = {
  product: { variants: VariantConnection } | null;
};

type ProductQueryData = {
  shop: { currencyCode: string };
  product: ProductNode | null;
};

type ProductCollectionsQueryData = {
  collections: {
    nodes: Array<{
      id: string;
      title: string;
      handle: string;
      productsCount: { count: number };
      products: {
        nodes: Array<{
          id: string;
          title: string;
        }>;
      };
    }>;
  };
};

type ThemeNode = {
  id: string;
  name: string;
  role: string;
};

type ThemesQueryData = {
  themes: { nodes: ThemeNode[] };
};

type ThemeFilesQueryData = {
  theme: {
    id: string;
    name: string;
    role: string;
    files: {
      nodes: Array<{
        filename: string;
        body: {
          content?: string;
        } | null;
      }>;
      userErrors: Array<{
        code?: string;
        filename?: string;
      }>;
      pageInfo: PageInfo;
    };
  } | null;
};

type GraphqlEnvelope<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

export class ShopifyAdminApiError extends Error {
  constructor(public readonly status: number) {
    super(`Shopify Admin API request failed with status ${status}.`);
    this.name = "ShopifyAdminApiError";
  }
}

export class ShopifyAdminClient {
  private readonly endpoint: string;

  constructor(
    private readonly options: {
      shopDomain: string;
      accessToken: string;
      apiVersion: string;
      productPageSize: number;
      maxAttempts?: number;
      requestTimeoutMs?: number;
      operationTimeoutMs?: number;
      fetchImpl?: typeof fetch;
    },
  ) {
    this.endpoint =
      "https://" +
      options.shopDomain +
      "/admin/api/" +
      options.apiVersion +
      "/graphql.json";
  }

  async getShopIdentity(): Promise<ShopifyShopIdentity> {
    const data = await this.graphql<{ shop: ShopifyShopIdentity }>(
      `query SelfxShopIdentity {
        shop {
          id
          name
          myshopifyDomain
        }
      }`,
      {},
    );
    return data.shop;
  }

  async listProductsPage(after: string | null): Promise<ShopifyProductPage> {
    const data = await this.graphql<ProductsQueryData>(productsQuery, {
      first: this.options.productPageSize,
      after,
      variantFirst: variantPageSize,
    });
    const products: ShopifyProduct[] = [];
    for (const product of data.products.nodes) {
      products.push(await this.completeProductVariants(product));
    }
    return {
      currencyCode: data.shop.currencyCode,
      products,
      endCursor: data.products.pageInfo.endCursor,
      hasNextPage: data.products.pageInfo.hasNextPage,
    };
  }

  async getProduct(productId: string): Promise<ShopifyProductResult> {
    const deadlineAt = this.options.operationTimeoutMs
      ? Date.now() + this.options.operationTimeoutMs
      : undefined;
    const data = await this.graphql<ProductQueryData>(
      productQuery,
      {
        productId,
        variantFirst: variantPageSize,
      },
      deadlineAt,
    );
    return {
      currencyCode: data.shop.currencyCode,
      product: data.product
        ? await this.completeProductVariants(data.product, deadlineAt)
        : null,
    };
  }

  async listProductCollections(options?: {
    first?: number;
    productFirst?: number;
  }): Promise<ShopifyProductCollection[]> {
    const data = await this.graphql<ProductCollectionsQueryData>(
      productCollectionsQuery,
      {
        first: Math.min(Math.max(options?.first ?? 20, 1), 50),
        productFirst: Math.min(Math.max(options?.productFirst ?? 100, 1), 250),
      },
    );
    return data.collections.nodes.map((collection) => ({
      id: collection.id,
      title: collection.title,
      handle: collection.handle,
      productsCount: collection.productsCount.count,
      products: collection.products.nodes,
    }));
  }

  async getThemeAppBlockStatus(
    blockHandle: string,
  ): Promise<ShopifyThemeAppBlockStatus> {
    // Merchants can assign the app block to alternate product templates too.
    const checkedFilenames = ["templates/product*.json"];
    const themes = await this.graphql<ThemesQueryData>(themesQuery, {});
    const mainTheme = themes.themes.nodes.find(
      (theme) => theme.role === "MAIN",
    );
    if (!mainTheme) {
      return { status: "NO_MAIN_THEME", checkedFilenames };
    }

    let installed = false;
    let after: string | null = null;
    for (let page = 0; ; page++) {
      if (page >= 50)
        throw new Error("Theme template verification exceeded its limit.");
      const data: ThemeFilesQueryData = await this.graphql<ThemeFilesQueryData>(
        themeFilesQuery,
        {
          themeId: mainTheme.id,
          filenames: checkedFilenames,
          after,
        },
      );
      const files = data.theme?.files;
      if (!files || files.userErrors.length)
        throw new Error("Shopify theme templates could not be read.");
      // An unreadable template is an unknown result, never proof of absence.
      for (const file of files.nodes)
        installed =
          themeFileContainsAppBlock(file.body?.content, blockHandle) ||
          installed;
      if (installed || !files.pageInfo.hasNextPage) break;
      const next = files.pageInfo.endCursor;
      if (!next || next === after)
        throw new Error("Shopify returned an invalid theme pagination cursor.");
      after = next;
    }
    return {
      status: installed ? "INSTALLED" : "NOT_INSTALLED",
      themeId: mainTheme.id,
      themeName: mainTheme.name,
      checkedFilenames,
    };
  }

  private async completeProductVariants(
    product: ProductNode,
    deadlineAt?: number,
  ): Promise<ShopifyProduct> {
    const variants = [...product.variants.nodes];
    let pageInfo = product.variants.pageInfo;
    while (pageInfo.hasNextPage) {
      if (!pageInfo.endCursor) {
        throw new Error(
          "Shopify returned an invalid variant pagination cursor.",
        );
      }
      const data = await this.graphql<ProductVariantsQueryData>(
        productVariantsQuery,
        {
          productId: product.id,
          first: variantPageSize,
          after: pageInfo.endCursor,
        },
        deadlineAt,
      );
      if (!data.product) {
        throw new Error("Shopify product disappeared during catalog sync.");
      }
      variants.push(...data.product.variants.nodes);
      pageInfo = data.product.variants.pageInfo;
    }
    return { ...product, variants };
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
    deadlineAt?: number,
  ): Promise<T> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const maxAttempts = this.options.maxAttempts ?? defaultMaxAttempts;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const remainingMs = deadlineAt
        ? Math.max(deadlineAt - Date.now(), 0)
        : undefined;
      if (remainingMs === 0) {
        throw new Error("Shopify Admin API operation timed out.");
      }
      const response = await fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.options.accessToken,
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(
          Math.min(
            this.options.requestTimeoutMs ?? defaultRequestTimeoutMs,
            remainingMs ?? Number.POSITIVE_INFINITY,
          ),
        ),
      });
      if (
        !response.ok &&
        attempt < maxAttempts &&
        (response.status === 429 || response.status >= 500)
      ) {
        await delay(retryDelayMs(response, attempt));
        continue;
      }
      if (!response.ok) {
        throw new ShopifyAdminApiError(response.status);
      }
      const envelope = (await response.json()) as GraphqlEnvelope<T>;
      if (envelope.errors?.length) {
        throw new Error(
          "Shopify GraphQL query failed: " +
            (envelope.errors[0]?.message ?? "unknown error"),
        );
      }
      if (!envelope.data) {
        throw new Error("Shopify GraphQL response did not include data.");
      }
      return envelope.data;
    }
    throw new Error("Shopify Admin API request failed.");
  }
}

const productFields = [
  "id",
  "title",
  "handle",
  "description",
  "status",
  "tags",
  "category { id fullName }",
  "updatedAt",
  "onlineStoreUrl",
  "featuredMedia { preview { image { url } } }",
].join("\n");

const variantFields = [
  "id",
  "title",
  "sku",
  "price",
  "availableForSale",
  "image { url }",
].join("\n");

const productsQuery = [
  "query SelfxProducts($first: Int!, $after: String, $variantFirst: Int!) {",
  "  shop { currencyCode }",
  "  products(first: $first, after: $after, sortKey: UPDATED_AT) {",
  "    nodes {",
  productFields,
  "      variants(first: $variantFirst) {",
  "        nodes { " + variantFields + " }",
  "        pageInfo { hasNextPage endCursor }",
  "      }",
  "    }",
  "    pageInfo { hasNextPage endCursor }",
  "  }",
  "}",
].join("\n");

const productQuery = [
  "query SelfxProduct($productId: ID!, $variantFirst: Int!) {",
  "  shop { currencyCode }",
  "  product(id: $productId) {",
  productFields,
  "    variants(first: $variantFirst) {",
  "      nodes { " + variantFields + " }",
  "      pageInfo { hasNextPage endCursor }",
  "    }",
  "  }",
  "}",
].join("\n");

const productVariantsQuery = [
  "query SelfxProductVariants($productId: ID!, $first: Int!, $after: String) {",
  "  product(id: $productId) {",
  "    variants(first: $first, after: $after) {",
  "      nodes { " + variantFields + " }",
  "      pageInfo { hasNextPage endCursor }",
  "    }",
  "  }",
  "}",
].join("\n");

const productCollectionsQuery = [
  "query SelfxProductCollections($first: Int!, $productFirst: Int!) {",
  "  collections(first: $first, sortKey: TITLE) {",
  "    nodes {",
  "      id",
  "      title",
  "      handle",
  "      productsCount { count }",
  "      products(first: $productFirst) {",
  "        nodes { id title }",
  "      }",
  "    }",
  "  }",
  "}",
].join("\n");

const themesQuery = [
  "query SelfxThemes {",
  "  themes(first: 1, roles: [MAIN]) {",
  "    nodes { id name role }",
  "  }",
  "}",
].join("\n");

const themeFilesQuery = [
  "query SelfxThemeTemplate($themeId: ID!, $filenames: [String!]!, $after: String) {",
  "  theme(id: $themeId) {",
  "    id",
  "    name",
  "    role",
  "    files(filenames: $filenames, first: 100, after: $after) {",
  "      nodes {",
  "        filename",
  "        body {",
  "          ... on OnlineStoreThemeFileBodyText { content }",
  "        }",
  "      }",
  "      userErrors { code filename }",
  "      pageInfo { hasNextPage endCursor }",
  "    }",
  "  }",
  "}",
].join("\n");

function themeFileContainsAppBlock(
  content: string | undefined,
  blockHandle: string,
): boolean {
  if (!content)
    throw new Error("Shopify returned an unreadable theme template.");
  const errors: ParseError[] = [];
  const parsed: unknown = parseJsonc(content, errors, {
    allowTrailingComma: true,
  });
  if (
    errors.length ||
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  )
    throw new Error("Shopify returned an invalid theme template.");
  return jsonValueContainsAppBlock(parsed, blockHandle);
}

function jsonValueContainsAppBlock(
  value: unknown,
  blockHandle: string,
): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => jsonValueContainsAppBlock(item, blockHandle));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (
      typeof record.type === "string" &&
      record.type.startsWith("shopify://apps/") &&
      record.type.includes(`/blocks/${blockHandle}/`)
    )
      return true;
    return Object.values(value).some((item) =>
      jsonValueContainsAppBlock(item, blockHandle),
    );
  }
  return false;
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1_000, 10_000);
  }
  return Math.min(250 * 2 ** (attempt - 1), 2_000);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
