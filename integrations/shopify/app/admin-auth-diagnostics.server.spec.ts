import { afterEach, describe, expect, it, vi } from "vitest";
import { withAdminAuthDiagnostics } from "./admin-auth-diagnostics.server";

afterEach(() => vi.restoreAllMocks());

describe("Shopify admin auth diagnostics", () => {
  it("records a 401 without leaking tokens or consuming the original response", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Response("private response body", {
      status: 401,
      headers: {
        "X-Shopify-Retry-Invalid-Session-Request": "1",
        "X-Shopify-API-Request-Failure-Reauthorize-Url":
          "https://private-auth.test/?token=secret-reauth",
      },
    });
    const request = new Request(
      "https://example.test/app.data?id_token=secret-jwt&shop=private-shop&host=private-host",
      {
        method: "POST",
        headers: { Authorization: "Bearer secret-bearer" },
      },
    );
    const authenticate = withAdminAuthDiagnostics(async () => {
      throw failure;
    });
    await expect(authenticate(request)).rejects.toBe(failure);
    expect(failure.bodyUsed).toBe(false);
    expect(failure.headers.get("X-Shopify-Retry-Invalid-Session-Request")).toBe(
      "1",
    );
    const entry = JSON.parse(log.mock.calls[0]![0]);
    expect(entry).toMatchObject({
      event: "shopify_admin_auth_failed",
      route: "/app.data",
      method: "POST",
      status: 401,
      category: "unauthorized",
      bearerTokenPresent: true,
      idTokenPresent: true,
      retryInvalidSession: true,
      reauthorizationRequired: true,
    });
    expect(log.mock.calls[0]![0]).not.toMatch(
      /secret-jwt|secret-bearer|private/,
    );
  });

  it("omits arbitrary exception text and unrecognized URL paths", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("credential-in-message");
    failure.name = "credential-in-name";
    const authenticate = withAdminAuthDiagnostics(async () => {
      throw failure;
    });
    await expect(
      authenticate(new Request("https://example.test/credential-in-path")),
    ).rejects.toBe(failure);
    expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({
      category: "exception",
      route: "other",
    });
    expect(log.mock.calls[0]![0]).not.toContain("credential");
  });

  it("preserves normal redirects without logging failures", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const redirect = Response.redirect("https://example.test/auth");
    const authenticate = withAdminAuthDiagnostics(async () => {
      throw redirect;
    });
    await expect(
      authenticate(new Request("https://example.test/app")),
    ).rejects.toBe(redirect);
    expect(log).not.toHaveBeenCalled();
  });

  it("returns the original authenticated context", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const context = { session: {}, admin: {}, redirect: vi.fn() };
    const authenticate = withAdminAuthDiagnostics(async () => context);
    await expect(
      authenticate(new Request("https://example.test/app")),
    ).resolves.toBe(context);
    expect(log).not.toHaveBeenCalled();
  });
});
