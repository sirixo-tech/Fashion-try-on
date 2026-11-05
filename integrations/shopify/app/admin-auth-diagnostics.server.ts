import { randomUUID } from "node:crypto";

// Never include request/response contents or arbitrary exception text here.
export function withAdminAuthDiagnostics<T>(
  authenticate: (request: Request) => Promise<T>,
): (request: Request) => Promise<T> {
  return async (request) => {
    try {
      return await authenticate(request);
    } catch (error) {
      const response = error instanceof Response ? error : null;
      // Redirects are normal Shopify authentication control flow.
      if (!response || response.status >= 400) {
        const url = new URL(request.url);
        const route = [
          "/app",
          "/app.data",
          "/app/billing/return",
          "/selfx-action",
        ].includes(url.pathname)
          ? url.pathname
          : url.pathname.startsWith("/auth")
            ? "/auth/*"
            : "other";
        console.error(
          JSON.stringify({
            event: "shopify_admin_auth_failed",
            diagnosticId: randomUUID(),
            route,
            method: ["GET", "POST", "HEAD", "OPTIONS"].includes(request.method)
              ? request.method
              : "other",
            status: response?.status ?? null,
            category:
              response?.status === 401
                ? "unauthorized"
                : response?.status === 403
                  ? "forbidden"
                  : response
                    ? "http_error"
                    : "exception",
            bearerTokenPresent: /^Bearer\s+\S+/i.test(
              request.headers.get("authorization") ?? "",
            ),
            idTokenPresent: url.searchParams.has("id_token"),
            shopParameterPresent: url.searchParams.has("shop"),
            hostParameterPresent: url.searchParams.has("host"),
            retryInvalidSession:
              response?.headers.get(
                "X-Shopify-Retry-Invalid-Session-Request",
              ) === "1",
            reauthorizationRequired:
              response?.headers.get(
                "X-Shopify-API-Request-Failure-Reauthorize",
              ) === "1" ||
              Boolean(
                response?.headers.has(
                  "X-Shopify-API-Request-Failure-Reauthorize-Url",
                ),
              ),
            apiKeyConfigured: Boolean(process.env.SHOPIFY_API_KEY),
            apiSecretConfigured: Boolean(process.env.SHOPIFY_API_SECRET),
            appUrlConfigured: Boolean(process.env.SHOPIFY_APP_URL),
          }),
        );
      }
      // Preserve the exact response and Shopify's recovery headers.
      throw error;
    }
  };
}
