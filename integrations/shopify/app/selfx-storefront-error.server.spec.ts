import { describe, expect, it } from "vitest";

import {
  storefrontTryOnErrorMarkup,
  storefrontTryOnRedirectMarkup,
} from "./selfx-storefront-error.server";

describe("storefrontTryOnErrorMarkup", () => {
  it("renders a branded storefront error page", () => {
    const markup = storefrontTryOnErrorMarkup(
      "SelfX Try-On is not connected for this store yet.",
    );

    expect(markup).toContain("<title>SelfX Try-On unavailable</title>");
    expect(markup).toContain("<h1>Try-On unavailable</h1>");
    expect(markup).toContain(
      "SelfX Try-On is not connected for this store yet.",
    );
    expect(markup).toContain("Return to product");
  });

  it("escapes the displayed error message", () => {
    const markup = storefrontTryOnErrorMarkup(
      '<script>alert("bad")</script>',
    );

    expect(markup).toContain(
      "&lt;script&gt;alert(&quot;bad&quot;)&lt;/script&gt;",
    );
    expect(markup).not.toContain('<script>alert("bad")</script>');
  });
});

describe("storefrontTryOnRedirectMarkup", () => {
  it("renders a branded redirect page with a fallback link", () => {
    const markup = storefrontTryOnRedirectMarkup(
      "https://app.selfx.test/try-on/shopify?session=abc&shop=test.myshopify.com",
    );

    expect(markup).toContain("<title>Opening SelfX Try-On</title>");
    expect(markup).toContain("window.location.replace");
    expect(markup).toContain("Continue to Try-On");
    expect(markup).toContain(
      "https://app.selfx.test/try-on/shopify?session=abc&amp;shop=test.myshopify.com",
    );
  });

  it("escapes redirect URLs in HTML attributes", () => {
    const markup = storefrontTryOnRedirectMarkup(
      'https://app.selfx.test/try-on/shopify?next=<script>alert("bad")</script>',
    );

    expect(markup).toContain(
      "next=&lt;script&gt;alert(&quot;bad&quot;)&lt;/script&gt;",
    );
    expect(markup).not.toContain('href="https://app.selfx.test/try-on/shopify?next=<script>');
  });
});
