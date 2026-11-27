export type ThemeBlockStatus =
  | "NOT_CHECKED"
  | "INSTALLED"
  | "NOT_INSTALLED"
  | "NO_MAIN_THEME"
  | "UNAVAILABLE";

export function buildTryOnBlockThemeEditorUrl(
  shop: string,
  apiKey: string | undefined,
  status: ThemeBlockStatus,
): string | null {
  const domain = shop.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) return null;
  const url = new URL(`https://${domain}/admin/themes/current/editor`);
  url.searchParams.set("template", "product");
  // Opening the editor must not insert a second block, including when the
  // installation check was unavailable. Only confirmed absence permits adding.
  if (status === "NOT_INSTALLED" && apiKey?.trim()) {
    url.searchParams.set("addAppBlockId", `${apiKey.trim()}/selfx_try_it_on`);
    url.searchParams.set("target", "mainSection");
  }
  return url.toString();
}
