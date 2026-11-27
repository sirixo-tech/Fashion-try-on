import { describe, expect, it, vi } from "vitest";
import { ShopifyAdminClient } from "./shopify-admin.server.js";

const blockType =
  "shopify://apps/selfx-tryon/blocks/selfx_try_it_on/extension-id";
const blockTemplate = JSON.stringify({
  sections: { main: { blocks: { selfx: { type: blockType } } } },
});
function page(content: string | null, extra = {}) {
  return {
    theme: {
      files: {
        nodes: [
          {
            filename: "templates/product.json",
            body: content === null ? null : { content },
          },
        ],
        userErrors: [],
        pageInfo: { hasNextPage: false, endCursor: null },
        ...extra,
      },
    },
  };
}
function clientFor(...pages: unknown[]) {
  const fetchImpl = vi.fn().mockResolvedValueOnce(
    Response.json({
      data: {
        themes: {
          nodes: [
            {
              id: "gid://shopify/OnlineStoreTheme/1",
              name: "Live",
              role: "MAIN",
            },
          ],
        },
      },
    }),
  );
  for (const data of pages)
    fetchImpl.mockResolvedValueOnce(Response.json({ data }));
  const client = new ShopifyAdminClient({
    shopDomain: "demo.myshopify.com",
    accessToken: "secret",
    apiVersion: "2026-07",
    productPageSize: 50,
    fetchImpl,
  });
  return { client, fetchImpl };
}

describe("saved theme block verification", () => {
  it.each([
    `/* Auto-generated Shopify theme file. */\n${blockTemplate}`,
    `{// comment\n"sections":{"main":{"blocks":{"selfx":{"type":"${blockType}",},},},},}`,
  ])(
    "recognizes existing blocks in Shopify JSON with comments and trailing commas",
    async (content) => {
      const { client } = clientFor(page(content));
      await expect(
        client.getThemeAppBlockStatus("selfx_try_it_on"),
      ).resolves.toMatchObject({ status: "INSTALLED" });
    },
  );
  it.each(["{broken json", "/* header only */", "[]", "", null])(
    "does not report an unreadable template as missing (%s)",
    async (content) => {
      const { client } = clientFor(page(content));
      await expect(
        client.getThemeAppBlockStatus("selfx_try_it_on"),
      ).rejects.toThrow(/template/);
    },
  );
  it("does not report a file API error as absence", async () => {
    const { client } = clientFor(
      page("{}", {
        userErrors: [
          { code: "ACCESS_DENIED", filename: "templates/product.json" },
        ],
      }),
    );
    await expect(
      client.getThemeAppBlockStatus("selfx_try_it_on"),
    ).rejects.toThrow(/could not be read/);
  });
  it("does not report a missing theme response as absence", async () => {
    const { client } = clientFor({ theme: null });
    await expect(
      client.getThemeAppBlockStatus("selfx_try_it_on"),
    ).rejects.toThrow(/could not be read/);
  });
  it("checks later template pages before declaring the block absent", async () => {
    const { client, fetchImpl } = clientFor(
      page('{"sections":{}}', {
        pageInfo: { hasNextPage: true, endCursor: "next-page" },
      }),
      page(blockTemplate),
    );
    await expect(
      client.getThemeAppBlockStatus("selfx_try_it_on"),
    ).resolves.toMatchObject({ status: "INSTALLED" });
    expect(JSON.parse(fetchImpl.mock.calls[2]![1].body).variables.after).toBe(
      "next-page",
    );
  });
  it("cannot declare absence from an incomplete pagination response", async () => {
    const { client } = clientFor(
      page('{"sections":{}}', {
        pageInfo: { hasNextPage: true, endCursor: null },
      }),
    );
    await expect(
      client.getThemeAppBlockStatus("selfx_try_it_on"),
    ).rejects.toThrow(/pagination/);
  });
  it("does not mistake a block URL in unrelated settings for an installed block", async () => {
    const content = JSON.stringify({
      sections: {
        main: {
          blocks: {
            other: { type: "text", settings: { text: blockType } },
          },
        },
      },
    });
    const { client } = clientFor(page(content));
    await expect(
      client.getThemeAppBlockStatus("selfx_try_it_on"),
    ).resolves.toMatchObject({ status: "NOT_INSTALLED" });
  });
  it("recognizes a saved disabled block so the editor can manage it without inserting another", async () => {
    const { client } = clientFor(
      page(
        JSON.stringify({
          sections: {
            main: { blocks: { hidden: { type: blockType, disabled: true } } },
          },
        }),
      ),
    );
    await expect(
      client.getThemeAppBlockStatus("selfx_try_it_on"),
    ).resolves.toMatchObject({ status: "INSTALLED" });
  });
});
