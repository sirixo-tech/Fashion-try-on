import { Injectable } from "@nestjs/common";
import type { ProviderRequest } from "./payment-adapter.js";
@Injectable()
export class PhonePeTransport {
  async send(request: ProviderRequest): Promise<unknown> {
    if (
      process.env.SELFX_PHONEPE_UAT_ENABLED !== "true" ||
      !request.url.startsWith(
        "https://mercury-uat.phonepe.com/enterprise-sandbox/v3/",
      )
    )
      throw new Error("PhonePe UAT requests are disabled.");
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok || !response.body) throw new Error();
      const reader = response.body.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 65536) throw new Error();
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new Error("PhonePe response unavailable or invalid.");
    }
  }
}
