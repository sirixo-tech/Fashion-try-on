import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { isIP } from "node:net";
import { HttpStatus } from "@nestjs/common";
import { ApiErrorException } from "../common/api-error.exception.js";

export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && [18, 19].includes(b))
    );
  }
  return (
    isIP(address) === 6 &&
    /^[23][0-9a-f]{3}:/i.test(address) &&
    !/^2001:(?:db8|0):/i.test(address)
  );
}
export function publicCommerceUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidUrl();
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    !host.includes(".") ||
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    (isIP(host) && !publicAddress(host))
  )
    throw invalidUrl();
  return url;
}
function invalidUrl() {
  return new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    "COMMERCE_PUBLIC_URL_REQUIRED",
    "Use publicly reachable website and image URLs; localhost/private addresses cannot be used by SelfX.",
  );
}

/** Pin resolved public addresses per redirect; bound bytes and total request time. */
export async function fetchPublicCatalogImage(
  value: string,
  maxBytes: number,
  redirects = 0,
): Promise<{ buffer: Buffer; contentType: string | null }> {
  const url = publicCommerceUrl(value);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true });
  if (
    !addresses.length ||
    addresses.some((entry) => !publicAddress(entry.address))
  )
    throw invalidUrl();
  const selected =
    addresses.find((entry) => entry.family === 4) ?? addresses[0]!;
  return new Promise((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(
      url,
      {
        family: selected.family,
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [selected]);
          else callback(null, selected.address, selected.family);
        },
        headers: { Accept: "image/jpeg,image/png,image/webp" },
      },
      (response) => {
        if (
          [301, 302, 303, 307, 308].includes(response.statusCode ?? 0) &&
          response.headers.location &&
          redirects < 3
        ) {
          response.resume();
          try {
            void fetchPublicCatalogImage(
              new URL(response.headers.location, url).href,
              maxBytes,
              redirects + 1,
            ).then(resolve, reject);
          } catch (error) {
            reject(error);
          }
          return;
        }
        if (
          response.statusCode !== 200 ||
          Number(response.headers["content-length"] ?? 0) > maxBytes
        ) {
          response.destroy();
          reject(new Error("Catalog image unavailable"));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > maxBytes)
            response.destroy(new Error("Catalog image too large"));
          else chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({
            buffer: Buffer.concat(chunks),
            contentType: response.headers["content-type"] ?? null,
          }),
        );
        response.on("error", reject);
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error("Catalog image timed out")),
      15_000,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end();
  });
}
