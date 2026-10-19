import { Injectable } from "@nestjs/common";
import type { ProviderRequest } from "./payment-adapter.js";
import {
  PaymentProviderError,
  safeProviderCode,
} from "./payment-diagnostics.js";
import { phonePeUatBase, phonePeProductionBase } from "./phonepe-endpoints.js";
@Injectable()
export class PhonePeTransport {
  async send(request: ProviderRequest): Promise<unknown> {
    if (!allowedRequest(request))
      throw new PaymentProviderError("REQUEST_DISABLED");
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.body)
        throw new PaymentProviderError(
          response.ok ? "INVALID_RESPONSE" : "HTTP_REJECTED",
          response.status,
        );
      const reader = response.body.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 65536)
            throw new PaymentProviderError(
              "RESPONSE_TOO_LARGE",
              response.status,
            );
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      let payload: unknown;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new PaymentProviderError(
          response.ok ? "INVALID_RESPONSE" : "HTTP_REJECTED",
          response.status,
        );
      }
      if (!response.ok)
        throw new PaymentProviderError(
          "HTTP_REJECTED",
          response.status,
          safeProviderCode(
            payload && typeof payload === "object"
              ? (payload as Record<string, unknown>).code
              : null,
          ),
        );
      return payload;
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;
      throw new PaymentProviderError(
        error instanceof Error &&
          ["TimeoutError", "AbortError"].includes(error.name)
          ? "TIMEOUT"
          : "NETWORK_ERROR",
      );
    }
  }
}
function allowedRequest(request: ProviderRequest) {
  const bases: string[] = [];
  if (process.env.SELFX_PHONEPE_UAT_ENABLED === "true")
    bases.push(phonePeUatBase);
  if (process.env.SELFX_PHONEPE_PRODUCTION_ENABLED === "true") {
    try {
      bases.push(phonePeProductionBase());
    } catch {
      /* fail closed */
    }
  }
  return bases.some((base) => {
    if (!request.url.startsWith(base + "/v3/")) return false;
    const path = request.url.slice(base.length);
    return (
      (request.method === "POST" && path === "/v3/qr/init") ||
      (request.method === "GET" &&
        /^\/v3\/transaction\/[A-Za-z0-9_-]{1,100}\/[A-Za-z0-9_-]{1,34}\/status$/.test(
          path,
        ))
    );
  });
}
