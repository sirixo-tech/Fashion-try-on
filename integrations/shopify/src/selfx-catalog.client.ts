import {
  type SelfxCatalogSyncRequest,
  type SelfxCatalogSyncResponse,
} from "./contracts.js";

const maxAttempts = 3;

export class SelfxCatalogClient {
  constructor(
    private readonly options: {
      apiBaseUrl: string;
      integrationToken: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async sync(
    input: SelfxCatalogSyncRequest,
  ): Promise<SelfxCatalogSyncResponse> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const url = this.options.apiBaseUrl + "/api/v1/integrations/catalog/sync";
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-selfx-integration-token": this.options.integrationToken,
        },
        body: JSON.stringify(input),
      });
      if (
        !response.ok &&
        attempt < maxAttempts &&
        (response.status === 429 || response.status >= 500)
      ) {
        await delay(Math.min(250 * 2 ** (attempt - 1), 2_000));
        continue;
      }
      if (!response.ok) {
        throw new Error(
          "SelfX catalog sync failed with status " + response.status + ".",
        );
      }
      const result = (await response.json()) as SelfxCatalogSyncResponse;
      if (
        result.direction !== "COMMERCE_TO_SELFX" ||
        result.sourceOfTruth !== "COMMERCE_PLATFORM"
      ) {
        throw new Error("SelfX returned an invalid catalog sync response.");
      }
      return result;
    }
    throw new Error("SelfX catalog sync failed.");
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
