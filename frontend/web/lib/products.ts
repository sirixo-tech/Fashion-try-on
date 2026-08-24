import { selfxApi } from "@/lib/api";

export type PlatformProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  audience: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  active: boolean;
  vtoEnabled: boolean;
  priceAmountCents: number | null;
  priceCurrency: string | null;
  productUrl: string | null;
  garmentIntent: string;
  garmentCategory: string;
  garmentPhotoType: string;
  image: {
    url: string | null;
    storageKey: string | null;
    contentType: string | null;
    width: number | null;
    height: number | null;
  };
  createdAt: string;
  updatedAt: string;
};

export type PlatformProductInput = {
  name: string;
  categoryName: string;
  slug?: string;
  description?: string | null;
  audience?: string;
  priceAmountCents?: number | null;
  priceCurrency?: string | null;
  productUrl?: string | null;
  garmentIntent?: string;
  garmentCategory?: string;
  garmentPhotoType?: string;
  active?: boolean;
  vtoEnabled?: boolean;
  image?: {
    url?: string | null;
    storageKey?: string | null;
    contentType?: string | null;
    width?: number | null;
    height?: number | null;
  } | null;
};

export type PlatformProductListResponse = {
  data: PlatformProduct[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
};

export type PlatformProductImageUploadIntent = {
  storageKey: string;
  uploadUrl: string;
  method: "PUT";
  expiresAt: string;
  headers: Record<string, string>;
  maxImageBytes: number;
  supportedContentTypes: string[];
};

export function listPlatformProducts(
  accessToken: string,
  query: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: "ALL" | "ACTIVE" | "INACTIVE" | "VTO_ENABLED";
  } = {},
): Promise<PlatformProductListResponse> {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 25));
  if (query.search) {
    params.set("search", query.search);
  }
  if (query.status && query.status !== "ALL") {
    params.set("status", query.status);
  }
  return selfxApi<PlatformProductListResponse>(
    `/api/v1/admin/catalog/products?${params}`,
    { accessToken },
  );
}

export function createPlatformProduct(
  accessToken: string,
  input: PlatformProductInput,
): Promise<PlatformProduct> {
  return selfxApi<PlatformProduct>("/api/v1/admin/catalog/products", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

export function updatePlatformProduct(
  accessToken: string,
  productId: string,
  input: PlatformProductInput,
): Promise<PlatformProduct> {
  return selfxApi<PlatformProduct>(
    `/api/v1/admin/catalog/products/${productId}`,
    {
      method: "PATCH",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}

export function createPlatformProductImageUploadIntent(
  accessToken: string,
  input: { contentType: string; sizeBytes: number; fileName?: string },
): Promise<PlatformProductImageUploadIntent> {
  return selfxApi<PlatformProductImageUploadIntent>(
    "/api/v1/admin/catalog/products/images/upload-intent",
    {
      method: "POST",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}
