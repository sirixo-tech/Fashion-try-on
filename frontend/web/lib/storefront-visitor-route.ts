import { NextRequest, NextResponse } from "next/server";
import { normalizeApiUpstreamUrl } from "./api-routing";

// Browser calls this same-origin route even when ordinary API traffic uses a
// different host. The visitor cookie therefore belongs to the SelfX web site.
export async function bindStorefrontVisitor(
  request: NextRequest,
): Promise<Response> {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  const origin = request.headers.get("origin");
  const secure = process.env.NODE_ENV === "production";
  const requestUrl = new URL(request.url);
  // Railway terminates TLS before forwarding requests to Next.js. In
  // production, request.url can therefore describe the internal HTTP hop;
  // the Host header still identifies the public host the browser contacted.
  const host = request.headers.get("host")?.trim() || requestUrl.host;
  let originIsSelfX = false;
  try {
    const expectedOrigin = new URL(
      `${secure ? "https:" : requestUrl.protocol}//${host}`,
    ).origin;
    const parsedOrigin = origin === null ? null : new URL(origin);
    originIsSelfX =
      parsedOrigin !== null &&
      origin === parsedOrigin.origin &&
      parsedOrigin.origin === expectedOrigin;
  } catch {
    /* A malformed or opaque Origin is rejected below. */
  }
  if (!originIsSelfX) {
    return NextResponse.json(
      {
        error: {
          code: "STOREFRONT_ORIGIN_DENIED",
          message: "Start Try-On from SelfX.",
        },
      },
      { status: 403, headers },
    );
  }
  let session: unknown;
  try {
    const body = await request.json();
    session = body?.session;
    if (Object.keys(body).length !== 1) session = null;
  } catch {
    /* Invalid JSON is rejected below. */
  }
  if (typeof session !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(session)) {
    return NextResponse.json(
      {
        error: {
          code: "STOREFRONT_SESSION_INVALID",
          message: "Return to the product page and try again.",
        },
      },
      { status: 400, headers },
    );
  }
  const name = secure
    ? "__Host-selfx_storefront_visitor"
    : "selfx_storefront_visitor";
  const cookie = request.cookies.get(name)?.value;
  try {
    const upstream =
      process.env.SELFX_API_UPSTREAM_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_SELFX_API_BASE_URL ||
      (!secure ? "http://localhost:3001" : "");
    const response = await fetch(
      `${normalizeApiUpstreamUrl(upstream)}/api/v1/public/integrations/commerce/try-on-sessions/${session}/visitor`,
      {
        method: "POST",
        headers:
          cookie && /^[A-Za-z0-9_-]{43}$/.test(cookie)
            ? { Cookie: `${name}=${cookie}` }
            : {},
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      },
    );
    const result = new Response(await response.text(), {
      status: response.status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
    const setCookie = response.headers.get("set-cookie");
    if (response.ok && setCookie) result.headers.set("Set-Cookie", setCookie);
    return result;
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "STOREFRONT_VISITOR_UNAVAILABLE",
          message: "Try-On is temporarily unavailable. Please try again.",
        },
      },
      { status: 503, headers },
    );
  }
}
