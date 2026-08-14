import { describe, expect, it } from "vitest";

import {
  apiRewriteConfig,
  normalizeApiUpstreamUrl,
  resolveApiRewriteDestination,
} from "@/lib/api-routing";

describe("Next API rewrite routing", () => {
  it("maps /api/v1/* to the configured upstream", () => {
    expect(
      apiRewriteConfig({
        NODE_ENV: "production",
        SELFX_API_UPSTREAM_URL: "https://selfxapi.example.com/",
      }),
    ).toEqual([
      {
        source: "/api/v1/:path*",
        destination: "https://selfxapi.example.com/api/v1/:path*",
      },
    ]);
  });

  it("fails clearly when production same-origin proxy upstream is absent", () => {
    expect(() =>
      resolveApiRewriteDestination({
        NODE_ENV: "production",
      }),
    ).toThrow("SELFX_API_UPSTREAM_URL is required");
  });

  it("does not proxy to localhost in production", () => {
    expect(() =>
      resolveApiRewriteDestination({
        NODE_ENV: "production",
        SELFX_API_UPSTREAM_URL: "http://localhost:3001",
      }),
    ).toThrow("SELFX_API_UPSTREAM_URL must not point to localhost");
  });

  it("normalizes upstream URLs without double slashes", () => {
    expect(normalizeApiUpstreamUrl("https://selfxapi.example.com/")).toBe(
      "https://selfxapi.example.com",
    );
  });
});
