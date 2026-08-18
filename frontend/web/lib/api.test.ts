import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveBrowserApiBase,
  setAuthSessionHooks,
  selfxApi,
  selfxApiBaseUrl,
  selfxApiUrl,
} from "@/lib/api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("selfx web API routing", () => {
  afterEach(() => {
    setAuthSessionHooks(null);
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

  it("refreshes once and retries a protected request with the new access token", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");
    const refreshSession = vi.fn().mockResolvedValue("fresh-token");
    setAuthSessionHooks({
      getAccessToken: () => "stale-token",
      refreshSession,
      handleTerminalAuthFailure: vi.fn(),
    });
    const fetchMock = vi.fn(
      (input: string | URL | Request, init?: RequestInit) => {
        const authorization = new Headers(init?.headers).get("Authorization");
        if (String(input) === "/api/v1/admin/stores") {
          if (authorization === "Bearer stale-token") {
            return Promise.resolve(
              jsonResponse(
                {
                  error: {
                    code: "AUTH_ACCESS_TOKEN_INVALID",
                    message: "Access token is invalid or expired.",
                  },
                },
                401,
              ),
            );
          }
          return Promise.resolve(jsonResponse({ data: [] }));
        }
        return Promise.resolve(jsonResponse({ ok: true }));
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      selfxApi<{ data: unknown[] }>("/api/v1/admin/stores", {
        accessToken: "stale-token",
      }),
    ).resolves.toEqual({ data: [] });

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer fresh-token");
  });

  it("does not retry a protected request more than once", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");
    const terminal = vi.fn();
    setAuthSessionHooks({
      getAccessToken: () => "stale-token",
      refreshSession: vi.fn().mockResolvedValue("fresh-token"),
      handleTerminalAuthFailure: terminal,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "AUTH_ACCESS_TOKEN_INVALID",
            message: "Access token is invalid or expired.",
          },
        },
        401,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      selfxApi("/api/v1/admin/kiosks", { accessToken: "stale-token" }),
    ).rejects.toMatchObject({ code: "AUTH_ACCESS_TOKEN_INVALID" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(terminal).toHaveBeenCalledWith("fresh-token");
  });

  it("does not recursively refresh auth endpoints", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");
    const refreshSession = vi.fn().mockResolvedValue("fresh-token");
    setAuthSessionHooks({
      getAccessToken: () => "stale-token",
      refreshSession,
      handleTerminalAuthFailure: vi.fn(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: "AUTH_UNAUTHORIZED",
              message: "Refresh session is invalid or expired.",
            },
          },
          401,
        ),
      ),
    );

    await expect(
      selfxApi("/api/v1/auth/refresh", { method: "POST" }),
    ).rejects.toMatchObject({ code: "AUTH_UNAUTHORIZED" });
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("keeps current protected clients on the shared selfxApi path", () => {
    const protectedClients = [
      "lib/stores.ts",
      "lib/kiosks.ts",
      "lib/organizations.ts",
      "lib/try-on-lab-api.ts",
    ];

    for (const relativePath of protectedClients) {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      expect(source).toContain("selfxApi");
      expect(source).not.toContain("selfxApiUrl(");
      expect(source).not.toMatch(/\bfetch\(/);
    }
  });
});
