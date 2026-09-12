import { describe, expect, it } from "vitest";

import { storefrontTryOnErrorMarkup } from "./selfx-storefront-error.server";

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
