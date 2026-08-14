import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveBrowserApiBase,
  selfxApi,
  selfxApiBaseUrl,
  selfxApiUrl,
} from "@/lib/api";

describe("selfx web API routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("pure resolver uses same-origin relative API base by default in production", () => {
    expect(resolveBrowserApiBase({ nodeEnv: "production" })).toBe("");
  });

  it("pure resolver keeps development localhost fallback when no API URL is explicit", () => {
    expect(resolveBrowserApiBase({ nodeEnv: "development" })).toBe(
      "http://localhost:3001",
    );
  });

  it("pure resolver keeps explicit local API URLs for development", () => {
    expect(
      resolveBrowserApiBase({
        nodeEnv: "development",
        publicApiUrl: "http://localhost:3001/",
      }),
    ).toBe("http://localhost:3001");
  });

  it("browser wrapper uses direct env references for production same-origin URLs", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");

    expect(selfxApiBaseUrl()).toBe("");
    expect(selfxApiUrl("/api/v1/auth/login")).toBe("/api/v1/auth/login");
  });

  it("browser wrapper keeps explicit local API URLs for development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3001/");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");

    expect(selfxApiUrl("/api/v1/auth/login")).toBe(
      "http://localhost:3001/api/v1/auth/login",
    );
  });

  it("browser wrapper keeps development localhost fallback when no API URL is explicit", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");

    expect(selfxApiUrl("/api/v1/auth/login")).toBe(
      "http://localhost:3001/api/v1/auth/login",
    );
  });

  it("supports legacy explicit public API URL", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "http://localhost:3001/");

    expect(selfxApiUrl("/api/v1/auth/login")).toBe(
      "http://localhost:3001/api/v1/auth/login",
    );
  });

  it("does not silently allow localhost public API URLs in production", () => {
    expect(() => {
      resolveBrowserApiBase({
        nodeEnv: "production",
        publicApiUrl: "http://localhost:3001",
      });
    }).toThrow("Production web API URL must not point to localhost");
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
