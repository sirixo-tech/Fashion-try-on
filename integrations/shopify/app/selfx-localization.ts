export const supportedStorefrontLocales = [
  { code: "en", label: "English" },
  { code: "es", label: "Espanol" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "fr", label: "Francais" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Portugues" },
  { code: "it", label: "Italiano" },
] as const;

export type StorefrontLocale = (typeof supportedStorefrontLocales)[number]["code"];

const supportedLocaleCodes = new Set<string>(
  supportedStorefrontLocales.map((locale) => locale.code),
);

export function normalizeStorefrontLocale(value: unknown): StorefrontLocale {
  const clean = String(value ?? "").trim().toLowerCase().split("-")[0];
  return supportedLocaleCodes.has(clean) ? (clean as StorefrontLocale) : "en";
}

export function storefrontLocaleLabel(locale: string | null | undefined): string {
  const normalized = normalizeStorefrontLocale(locale);
  return (
    supportedStorefrontLocales.find((item) => item.code === normalized)?.label ??
    "English"
  );
}
