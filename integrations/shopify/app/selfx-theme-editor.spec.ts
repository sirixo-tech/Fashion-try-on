import { describe, expect, it } from "vitest";
import {
  buildTryOnBlockThemeEditorUrl,
  type ThemeBlockStatus,
} from "./selfx-theme-editor";

describe("theme editor navigation", () => {
  it.each<ThemeBlockStatus>([
    "INSTALLED",
    "UNAVAILABLE",
    "NOT_CHECKED",
    "NO_MAIN_THEME",
  ])("never inserts a new block when status is %s", (status) => {
    const url = new URL(
      buildTryOnBlockThemeEditorUrl(
        "demo.myshopify.com",
        "client-key",
        status,
      )!,
    );
    expect(url.searchParams.get("template")).toBe("product");
    expect(url.searchParams.has("addAppBlockId")).toBe(false);
    expect(url.searchParams.has("target")).toBe(false);
  });
  it("offers insertion only for a confirmed missing block", () => {
    const url = new URL(
      buildTryOnBlockThemeEditorUrl(
        "demo.myshopify.com",
        "client-key",
        "NOT_INSTALLED",
      )!,
    );
    expect(url.searchParams.get("addAppBlockId")).toBe(
      "client-key/selfx_try_it_on",
    );
    expect(url.searchParams.get("target")).toBe("mainSection");
  });
  it("opens the editor without inserting when the client ID is unavailable", () => {
    expect(
      new URL(
        buildTryOnBlockThemeEditorUrl(
          "demo.myshopify.com",
          undefined,
          "NOT_INSTALLED",
        )!,
      ).searchParams.has("addAppBlockId"),
    ).toBe(false);
  });
  it.each([
    "https://evil.test",
    "demo.myshopify.com.evil.test",
    "demo.myshopify.com/path",
  ])("rejects unexpected editor host %s", (shop) => {
    expect(
      buildTryOnBlockThemeEditorUrl(shop, "client-key", "INSTALLED"),
    ).toBeNull();
  });
});
