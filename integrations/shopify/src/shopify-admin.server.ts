import {
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
        body:
          | {
              content?: string;
            }
          | null;
      }>;
      userErrors: Array<{
        code?: string;
        filename?: string;
      }>;
    };
  } | null;
};

type GraphqlEnvelope<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

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

  async getThemeAppBlockStatus(
    blockHandle: string,
  ): Promise<ShopifyThemeAppBlockStatus> {
    const checkedFilenames = ["templates/product.json"];
    const themes = await this.graphql<ThemesQueryData>(themesQuery, {});
    const mainTheme = themes.themes.nodes.find(
      (theme) => theme.role === "MAIN",
    );
    if (!mainTheme) {
      return { status: "NO_MAIN_THEME", checkedFilenames };
    }

    const data = await this.graphql<ThemeFilesQueryData>(themeFilesQuery, {
      themeId: mainTheme.id,
      filenames: checkedFilenames,
    });
    const installed =
      data.theme?.files.nodes.some((file) =>
        themeFileContainsAppBlock(file.body?.content, blockHandle),
      ) ?? false;
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
        throw new Error(
          "Shopify Admin API request failed with status " +
            response.status +
            ".",
        );
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

const themesQuery = [
  "query SelfxThemes {",
  "  themes(first: 10) {",
  "    nodes { id name role }",
  "  }",
  "}",
].join("\n");

const themeFilesQuery = [
  "query SelfxThemeTemplate($themeId: ID!, $filenames: [String!]!) {",
  "  theme(id: $themeId) {",
  "    id",
  "    name",
  "    role",
  "    files(filenames: $filenames, first: 10) {",
  "      nodes {",
  "        filename",
  "        body {",
  "          ... on OnlineStoreThemeFileBodyText { content }",
  "        }",
  "      }",
  "      userErrors { code filename }",
  "    }",
  "  }",
  "}",
].join("\n");

function themeFileContainsAppBlock(
  content: string | undefined,
  blockHandle: string,
): boolean {
  if (!content) return false;
  try {
    return jsonValueContainsAppBlock(JSON.parse(content) as unknown, blockHandle);
  } catch {
    return false;
  }
}

function jsonValueContainsAppBlock(
  value: unknown,
  blockHandle: string,
): boolean {
  if (typeof value === "string") {
    return (
      value.startsWith("shopify://apps/") &&
      value.includes(`/blocks/${blockHandle}/`)
    );
  }
  if (Array.isArray(value)) {
    return value.some((item) => jsonValueContainsAppBlock(item, blockHandle));
  }
  if (value && typeof value === "object") {
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
