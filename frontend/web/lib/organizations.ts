import { selfxApi } from "@/lib/api";

export type TenantOrganization = {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "PENDING_ACTIVATION" | "SUSPENDED" | "ARCHIVED" | string;
  timezone: string;
  settings: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type OrganizationListResponse = {
  data: TenantOrganization[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
};

export async function listActiveOrganizations(
  accessToken: string,
): Promise<TenantOrganization[]> {
  const response = await selfxApi<OrganizationListResponse>(
    "/api/v1/organizations",
    {
      accessToken,
    },
  );

  return response.data;
}
