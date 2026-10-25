import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
const template = readFileSync(
  fileURLToPath(
    new URL(
      "../extensions/selfx-tryon/blocks/selfx_try_it_on.liquid",
      import.meta.url,
    ),
  ),
  "utf8",
);
const script = template.match(/<script>([\s\S]*?)<\/script>/)?.[1];
function page(available: boolean) {
  const dom = new JSDOM(
    '<div class="selfx-tryon-block" hidden><button class="selfx-tryon-button" data-selfx-launch-url="/apps/selfx-tryon/launch" data-selfx-shop="merchant.myshopify.com" data-selfx-product-id="1001" data-selfx-product-handle="shirt">Try it on</button></div>',
    {
      url: "https://merchant.myshopify.com/products/shirt",
      runScripts: "outside-only",
    },
  );
  dom.window.fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ available }) });
  dom.window.open = vi.fn();
  dom.window.eval(script!);
  return dom;
}
describe("Shopify product button eligibility", () => {
  it("stays hidden when the backend rejects eligibility", async () => {
    const dom = page(false);
    await new Promise((resolve) => setImmediate(resolve));
    expect(
      (dom.window.document.querySelector(".selfx-tryon-block") as HTMLElement)
        .hidden,
    ).toBe(true);
    dom.window.document.querySelector("button")!.click();
    expect(dom.window.open).not.toHaveBeenCalled();
    dom.window.close();
  });
  it("shows an eligible button and does not install duplicate launch handlers", async () => {
    const dom = page(true);
    await new Promise((resolve) => setImmediate(resolve));
    dom.window.eval(script!);
    expect(
      (dom.window.document.querySelector(".selfx-tryon-block") as HTMLElement)
        .hidden,
    ).toBe(false);
    dom.window.document.querySelector("button")!.click();
    expect(dom.window.open).toHaveBeenCalledOnce();
    expect(vi.mocked(dom.window.open).mock.calls[0]?.[0]).toContain(
      "productId=1001",
    );
    dom.window.close();
  });
});
