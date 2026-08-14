import { afterEach, describe, expect, it, vi } from "vitest";

import { selfxApi, selfxApiBaseUrl, selfxApiUrl } from "@/lib/api";

describe("selfx web API routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses same-origin relative API paths by default in production", () => {
    expect(
      selfxApiBaseUrl({
        NODE_ENV: "production",
      }),
    ).toBe("");
    expect(
      selfxApiUrl("/api/v1/auth/login", {
        NODE_ENV: "production",
      }),
    ).toBe("/api/v1/auth/login");
  });

  it("keeps explicit local API URLs for development", () => {
    expect(
      selfxApiUrl("/api/v1/auth/login", {
        NODE_ENV: "development",
        NEXT_PUBLIC_API_URL: "http://localhost:3001/",
      }),
    ).toBe("http://localhost:3001/api/v1/auth/login");
  });

  it("does not silently allow localhost public API URLs in production", () => {
    expect(() =>
      selfxApiBaseUrl({
        NODE_ENV: "production",
        NEXT_PUBLIC_API_URL: "http://localhost:3001",
      }),
    ).toThrow("Production web API URL must not point to localhost");
  });

  it("fetches relative same-origin URLs in production when public API URL is absent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await selfxApi<{ ok: boolean }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@example.com", password: "secret" }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({
        credentials: "include",
      }),
    );
  });
});
