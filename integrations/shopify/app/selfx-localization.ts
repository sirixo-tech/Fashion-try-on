export const supportedLanguageLocales = [
  { code: "en", label: "English" },
  { code: "es", label: "Espanol" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "fr", label: "Francais" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Portugues" },
  { code: "it", label: "Italiano" },
] as const;

export const supportedStorefrontLocales = [
  { code: "auto", label: "Auto storefront language" },
  ...supportedLanguageLocales,
] as const;

export type LanguageLocale = (typeof supportedLanguageLocales)[number]["code"];
export type StorefrontLocale = (typeof supportedStorefrontLocales)[number]["code"];

const supportedLocaleCodes = new Set<string>(
  supportedStorefrontLocales.map((locale) => locale.code),
);
const supportedLanguageLocaleCodes = new Set<string>(
  supportedLanguageLocales.map((locale) => locale.code),
);

export function normalizeStorefrontLocale(value: unknown): StorefrontLocale {
  const clean = String(value ?? "").trim().toLowerCase().split("-")[0];
  return supportedLocaleCodes.has(clean) ? (clean as StorefrontLocale) : "auto";
}

export function normalizeLanguageLocale(value: unknown): LanguageLocale {
  const clean = String(value ?? "").trim().toLowerCase().split("-")[0];
  return supportedLanguageLocaleCodes.has(clean) ? (clean as LanguageLocale) : "en";
}

export function storefrontLocaleLabel(locale: string | null | undefined): string {
  const normalized = normalizeStorefrontLocale(locale);
  return (
    supportedStorefrontLocales.find((item) => item.code === normalized)?.label ??
    "English"
  );
}

export function languageLocaleLabel(locale: string | null | undefined): string {
  const normalized = normalizeLanguageLocale(locale);
  return (
    supportedLanguageLocales.find((item) => item.code === normalized)?.label ??
    "English"
  );
}

type AdminTextKey =
  | "appHeading"
  | "setup"
  | "display"
  | "settings"
  | "analytics"
  | "leads"
  | "plans"
  | "support"
  | "saveSettings"
  | "saving"
  | "settingsUpdated"
  | "settingsFailed"
  | "maxTryOnsPerVisitor"
  | "visitorLimitPeriod"
  | "monthlyStoreCap"
  | "storefrontWidgetLanguage"
  | "adminPanelLanguage"
  | "daily"
  | "weekly"
  | "monthly";

const adminText: Record<LanguageLocale, Record<AdminTextKey, string>> = {
  en: {
    appHeading: "SelfX Virtual Try-On",
    setup: "Setup",
    display: "Display",
    settings: "Settings",
    analytics: "Analytics",
    leads: "Leads",
    plans: "Plans",
    support: "Support",
    saveSettings: "Save settings",
    saving: "Saving",
    settingsUpdated: "Settings updated",
    settingsFailed: "Settings update failed",
    maxTryOnsPerVisitor: "Max Try-Ons per visitor",
    visitorLimitPeriod: "Visitor limit period",
    monthlyStoreCap: "Monthly store cap",
    storefrontWidgetLanguage: "Storefront widget language",
    adminPanelLanguage: "Admin panel language",
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
  },
  es: {
    appHeading: "SelfX Probador Virtual",
    setup: "Configuracion",
    display: "Visualizacion",
    settings: "Ajustes",
    analytics: "Analitica",
    leads: "Clientes potenciales",
    plans: "Planes",
    support: "Soporte",
    saveSettings: "Guardar ajustes",
    saving: "Guardando",
    settingsUpdated: "Ajustes actualizados",
    settingsFailed: "No se pudieron guardar los ajustes",
    maxTryOnsPerVisitor: "Maximo de pruebas por visitante",
    visitorLimitPeriod: "Periodo del limite por visitante",
    monthlyStoreCap: "Limite mensual de la tienda",
    storefrontWidgetLanguage: "Idioma del widget de tienda",
    adminPanelLanguage: "Idioma del panel admin",
    daily: "Diario",
    weekly: "Semanal",
    monthly: "Mensual",
  },
  ar: {
    appHeading: "SelfX تجربة افتراضية",
    setup: "الإعداد",
    display: "العرض",
    settings: "الإعدادات",
    analytics: "التحليلات",
    leads: "العملاء المحتملون",
    plans: "الخطط",
    support: "الدعم",
    saveSettings: "حفظ الإعدادات",
    saving: "جار الحفظ",
    settingsUpdated: "تم تحديث الإعدادات",
    settingsFailed: "فشل تحديث الإعدادات",
    maxTryOnsPerVisitor: "الحد الأقصى للتجارب لكل زائر",
    visitorLimitPeriod: "فترة حد الزائر",
    monthlyStoreCap: "حد المتجر الشهري",
    storefrontWidgetLanguage: "لغة واجهة المتجر",
    adminPanelLanguage: "لغة لوحة الإدارة",
    daily: "يومي",
    weekly: "أسبوعي",
    monthly: "شهري",
  },
  hi: {
    appHeading: "SelfX वर्चुअल ट्राय-ऑन",
    setup: "सेटअप",
    display: "डिस्प्ले",
    settings: "सेटिंग्स",
    analytics: "एनालिटिक्स",
    leads: "लीड्स",
    plans: "प्लान",
    support: "सपोर्ट",
    saveSettings: "सेटिंग्स सेव करें",
    saving: "सेव हो रहा है",
    settingsUpdated: "सेटिंग्स अपडेट हो गईं",
    settingsFailed: "सेटिंग्स अपडेट नहीं हुईं",
    maxTryOnsPerVisitor: "हर विजिटर के लिए अधिकतम ट्राय-ऑन",
    visitorLimitPeriod: "विजिटर लिमिट अवधि",
    monthlyStoreCap: "मासिक स्टोर कैप",
    storefrontWidgetLanguage: "स्टोरफ्रंट विजेट भाषा",
    adminPanelLanguage: "एडमिन पैनल भाषा",
    daily: "दैनिक",
    weekly: "साप्ताहिक",
    monthly: "मासिक",
  },
  fr: {
    appHeading: "SelfX Essayage Virtuel",
    setup: "Configuration",
    display: "Affichage",
    settings: "Parametres",
    analytics: "Analytique",
    leads: "Prospects",
    plans: "Plans",
    support: "Support",
    saveSettings: "Enregistrer",
    saving: "Enregistrement",
    settingsUpdated: "Parametres mis a jour",
    settingsFailed: "Echec de la mise a jour",
    maxTryOnsPerVisitor: "Essayages max par visiteur",
    visitorLimitPeriod: "Periode de limite visiteur",
    monthlyStoreCap: "Plafond mensuel boutique",
    storefrontWidgetLanguage: "Langue du widget boutique",
    adminPanelLanguage: "Langue du panneau admin",
    daily: "Quotidien",
    weekly: "Hebdomadaire",
    monthly: "Mensuel",
  },
  de: {
    appHeading: "SelfX Virtuelle Anprobe",
    setup: "Einrichtung",
    display: "Anzeige",
    settings: "Einstellungen",
    analytics: "Analysen",
    leads: "Leads",
    plans: "Plane",
    support: "Support",
    saveSettings: "Einstellungen speichern",
    saving: "Speichern",
    settingsUpdated: "Einstellungen aktualisiert",
    settingsFailed: "Einstellungen konnten nicht gespeichert werden",
    maxTryOnsPerVisitor: "Max. Anproben pro Besucher",
    visitorLimitPeriod: "Besucherlimit Zeitraum",
    monthlyStoreCap: "Monatliches Shop-Limit",
    storefrontWidgetLanguage: "Storefront Widget-Sprache",
    adminPanelLanguage: "Admin-Sprache",
    daily: "Taglich",
    weekly: "Wochentlich",
    monthly: "Monatlich",
  },
  pt: {
    appHeading: "SelfX Prova Virtual",
    setup: "Configuracao",
    display: "Exibicao",
    settings: "Configuracoes",
    analytics: "Analises",
    leads: "Leads",
    plans: "Planos",
    support: "Suporte",
    saveSettings: "Salvar configuracoes",
    saving: "Salvando",
    settingsUpdated: "Configuracoes atualizadas",
    settingsFailed: "Falha ao salvar configuracoes",
    maxTryOnsPerVisitor: "Maximo de provas por visitante",
    visitorLimitPeriod: "Periodo do limite por visitante",
    monthlyStoreCap: "Limite mensal da loja",
    storefrontWidgetLanguage: "Idioma do widget da loja",
    adminPanelLanguage: "Idioma do painel admin",
    daily: "Diario",
    weekly: "Semanal",
    monthly: "Mensal",
  },
  it: {
    appHeading: "SelfX Prova Virtuale",
    setup: "Configurazione",
    display: "Visualizza",
    settings: "Impostazioni",
    analytics: "Analisi",
    leads: "Lead",
    plans: "Piani",
    support: "Supporto",
    saveSettings: "Salva impostazioni",
    saving: "Salvataggio",
    settingsUpdated: "Impostazioni aggiornate",
    settingsFailed: "Aggiornamento impostazioni non riuscito",
    maxTryOnsPerVisitor: "Try-On massimi per visitatore",
    visitorLimitPeriod: "Periodo limite visitatore",
    monthlyStoreCap: "Limite mensile negozio",
    storefrontWidgetLanguage: "Lingua widget storefront",
    adminPanelLanguage: "Lingua pannello admin",
    daily: "Giornaliero",
    weekly: "Settimanale",
    monthly: "Mensile",
  },
};

export function adminT(
  locale: string | null | undefined,
  key: AdminTextKey,
): string {
  return adminText[normalizeLanguageLocale(locale)][key] ?? adminText.en[key];
}
