export const STORE_TRY_ON_CAPABILITIES = [
  "GARMENT_TRY_ON",
  "JEWELLERY_TRY_ON",
] as const;

export type StoreTryOnCapability = (typeof STORE_TRY_ON_CAPABILITIES)[number];

export const DEFAULT_STORE_TRY_ON_CAPABILITIES: StoreTryOnCapability[] = [
  "GARMENT_TRY_ON",
];

const SUPPORTED_CAPABILITIES = new Set<string>(STORE_TRY_ON_CAPABILITIES);

export function normalizeStoreTryOnCapabilities(
  value: unknown,
  fallback: StoreTryOnCapability[] = DEFAULT_STORE_TRY_ON_CAPABILITIES,
): StoreTryOnCapability[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is StoreTryOnCapability =>
      SUPPORTED_CAPABILITIES.has(item),
    );
  const unique = [...new Set(normalized)];
  return unique.length > 0 ? unique : [...fallback];
}

