export function readableShopDomain(value: unknown): string | null {
  const domain =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).shopDomain
      : value;
  if (typeof domain !== "string") return null;
  const normalized = domain.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized)
    ? normalized
    : null;
}
