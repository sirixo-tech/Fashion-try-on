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
  | "refresh"
  | "saveSettings"
  | "saving"
  | "settingsUpdated"
  | "settingsFailed"
  | "totalTryOns"
  | "thisMonth"
  | "availableCredits"
  | "allShopifyStorefrontSessions"
  | "generated"
  | "noUsageYet"
  | "trial"
  | "notConnected"
  | "creditsLeft"
  | "viewPlans"
  | "openSelfxBilling"
  | "tryOnPaused"
  | "tryOnCreditsLow"
  | "noCredits"
  | "lowCredits"
  | "creditsAvailable"
  | "creditsUnavailable"
  | "emptyCreditsMessage"
  | "lowCreditsMessage"
  | "maxTryOnsPerVisitor"
  | "visitorLimitPeriod"
  | "monthlyStoreCap"
  | "storefrontWidgetLanguage"
  | "adminPanelLanguage"
  | "visitorLimitEnabled"
  | "visitorLimitsOff"
  | "monthlyStoreCapEnabled"
  | "monthlyStoreCapOff"
  | "storefrontAutoHelp"
  | "storefrontForcedHelp"
  | "currentAdminLanguage"
  | "currentStorefrontLanguage"
  | "arabicRtlNote"
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
    refresh: "Refresh",
    saveSettings: "Save settings",
    saving: "Saving",
    settingsUpdated: "Settings updated",
    settingsFailed: "Settings update failed",
    totalTryOns: "Total Try-Ons",
    thisMonth: "This Month",
    availableCredits: "Available Credits",
    allShopifyStorefrontSessions: "All Shopify storefront sessions",
    generated: "{count} generated",
    noUsageYet: "No usage yet",
    trial: "Trial",
    notConnected: "Not connected",
    creditsLeft: "{available} of {included} credits left",
    viewPlans: "View Plans",
    openSelfxBilling: "Open SelfX Billing",
    tryOnPaused: "Try-On is paused",
    tryOnCreditsLow: "Try-On credits are low",
    noCredits: "No credits",
    lowCredits: "Low credits",
    creditsAvailable: "Credits available",
    creditsUnavailable: "Credits unavailable",
    emptyCreditsMessage:
      "This store has no Try-On credits left. Shoppers will see a temporary unavailable message until credits are added.",
    lowCreditsMessage:
      "This store has {threshold} or fewer Try-On credits remaining.",
    maxTryOnsPerVisitor: "Max Try-Ons per visitor",
    visitorLimitPeriod: "Visitor limit period",
    monthlyStoreCap: "Monthly store cap",
    storefrontWidgetLanguage: "Storefront widget language",
    adminPanelLanguage: "Admin panel language",
    visitorLimitEnabled:
      "Each visitor can use up to {limit} Try-Ons per {period}.",
    visitorLimitsOff: "Per-visitor limits are off. Plan credits still apply.",
    monthlyStoreCapEnabled:
      "This Shopify store can run up to {limit} Try-Ons per calendar month.",
    monthlyStoreCapOff:
      "No custom monthly cap is set. The SelfX plan credit limit is still enforced.",
    storefrontAutoHelp:
      "Auto follows the shopper's Shopify storefront language when available.",
    storefrontForcedHelp:
      "Shoppers will see {language} for the SelfX Try-On launch page.",
    currentAdminLanguage: "Current admin language: {language}.",
    currentStorefrontLanguage: "Current storefront language: {language}.",
    arabicRtlNote: "Arabic uses a right-to-left shopper layout.",
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
    refresh: "Actualizar",
    saveSettings: "Guardar ajustes",
    saving: "Guardando",
    settingsUpdated: "Ajustes actualizados",
    settingsFailed: "No se pudieron guardar los ajustes",
    totalTryOns: "Pruebas totales",
    thisMonth: "Este mes",
    availableCredits: "Creditos disponibles",
    allShopifyStorefrontSessions: "Todas las sesiones de tienda Shopify",
    generated: "{count} generadas",
    noUsageYet: "Sin uso todavia",
    trial: "Prueba",
    notConnected: "No conectado",
    creditsLeft: "{available} de {included} creditos restantes",
    viewPlans: "Ver planes",
    openSelfxBilling: "Abrir facturacion SelfX",
    tryOnPaused: "Try-On esta pausado",
    tryOnCreditsLow: "Quedan pocos creditos Try-On",
    noCredits: "Sin creditos",
    lowCredits: "Pocos creditos",
    creditsAvailable: "Creditos disponibles",
    creditsUnavailable: "Creditos no disponibles",
    emptyCreditsMessage:
      "Esta tienda no tiene creditos Try-On. Los compradores veran un mensaje temporal de no disponible hasta que se agreguen creditos.",
    lowCreditsMessage:
      "Esta tienda tiene {threshold} o menos creditos Try-On restantes.",
    maxTryOnsPerVisitor: "Maximo de pruebas por visitante",
    visitorLimitPeriod: "Periodo del limite por visitante",
    monthlyStoreCap: "Limite mensual de la tienda",
    storefrontWidgetLanguage: "Idioma del widget de tienda",
    adminPanelLanguage: "Idioma del panel admin",
    visitorLimitEnabled:
      "Cada visitante puede usar hasta {limit} pruebas por {period}.",
    visitorLimitsOff:
      "Los limites por visitante estan desactivados. Los creditos del plan siguen aplicando.",
    monthlyStoreCapEnabled:
      "Esta tienda Shopify puede ejecutar hasta {limit} pruebas por mes calendario.",
    monthlyStoreCapOff:
      "No hay limite mensual personalizado. El limite de creditos del plan SelfX sigue activo.",
    storefrontAutoHelp:
      "Auto sigue el idioma de la tienda Shopify del comprador cuando este disponible.",
    storefrontForcedHelp:
      "Los compradores veran {language} en la pagina de inicio de SelfX Try-On.",
    currentAdminLanguage: "Idioma admin actual: {language}.",
    currentStorefrontLanguage: "Idioma de tienda actual: {language}.",
    arabicRtlNote: "Arabe usa un diseno de derecha a izquierda.",
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
    refresh: "تحديث",
    saveSettings: "حفظ الإعدادات",
    saving: "جار الحفظ",
    settingsUpdated: "تم تحديث الإعدادات",
    settingsFailed: "فشل تحديث الإعدادات",
    totalTryOns: "إجمالي التجارب",
    thisMonth: "هذا الشهر",
    availableCredits: "الأرصدة المتاحة",
    allShopifyStorefrontSessions: "كل جلسات واجهة Shopify",
    generated: "تم إنشاء {count}",
    noUsageYet: "لا يوجد استخدام بعد",
    trial: "تجربة",
    notConnected: "غير متصل",
    creditsLeft: "{available} من {included} رصيد متبق",
    viewPlans: "عرض الخطط",
    openSelfxBilling: "فتح فوترة SelfX",
    tryOnPaused: "تم إيقاف Try-On مؤقتا",
    tryOnCreditsLow: "أرصدة Try-On منخفضة",
    noCredits: "لا توجد أرصدة",
    lowCredits: "أرصدة منخفضة",
    creditsAvailable: "الأرصدة متاحة",
    creditsUnavailable: "الأرصدة غير متاحة",
    emptyCreditsMessage:
      "لا توجد أرصدة Try-On لهذا المتجر. سيرى المتسوقون رسالة عدم توفر مؤقتة حتى تتم إضافة أرصدة.",
    lowCreditsMessage:
      "لدى هذا المتجر {threshold} أو أقل من أرصدة Try-On المتبقية.",
    maxTryOnsPerVisitor: "الحد الأقصى للتجارب لكل زائر",
    visitorLimitPeriod: "فترة حد الزائر",
    monthlyStoreCap: "حد المتجر الشهري",
    storefrontWidgetLanguage: "لغة واجهة المتجر",
    adminPanelLanguage: "لغة لوحة الإدارة",
    visitorLimitEnabled:
      "يمكن لكل زائر استخدام حتى {limit} تجربة خلال {period}.",
    visitorLimitsOff:
      "حدود الزائر متوقفة. ما زالت أرصدة الخطة مطبقة.",
    monthlyStoreCapEnabled:
      "يمكن لهذا متجر Shopify تشغيل حتى {limit} تجربة في الشهر التقويمي.",
    monthlyStoreCapOff:
      "لا يوجد حد شهري مخصص. ما زال حد أرصدة خطة SelfX مطبقا.",
    storefrontAutoHelp:
      "الوضع التلقائي يتبع لغة واجهة متجر Shopify الخاصة بالمتسوق عند توفرها.",
    storefrontForcedHelp:
      "سيرى المتسوقون {language} في صفحة تشغيل SelfX Try-On.",
    currentAdminLanguage: "لغة الإدارة الحالية: {language}.",
    currentStorefrontLanguage: "لغة واجهة المتجر الحالية: {language}.",
    arabicRtlNote: "العربية تستخدم تخطيطا من اليمين إلى اليسار.",
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
    refresh: "रिफ्रेश",
    saveSettings: "सेटिंग्स सेव करें",
    saving: "सेव हो रहा है",
    settingsUpdated: "सेटिंग्स अपडेट हो गईं",
    settingsFailed: "सेटिंग्स अपडेट नहीं हुईं",
    totalTryOns: "कुल ट्राय-ऑन",
    thisMonth: "इस महीने",
    availableCredits: "उपलब्ध क्रेडिट",
    allShopifyStorefrontSessions: "सभी Shopify स्टोरफ्रंट सेशन",
    generated: "{count} जनरेट हुए",
    noUsageYet: "अभी कोई उपयोग नहीं",
    trial: "ट्रायल",
    notConnected: "कनेक्ट नहीं है",
    creditsLeft: "{included} में से {available} क्रेडिट बचे हैं",
    viewPlans: "प्लान देखें",
    openSelfxBilling: "SelfX बिलिंग खोलें",
    tryOnPaused: "Try-On रुका हुआ है",
    tryOnCreditsLow: "Try-On क्रेडिट कम हैं",
    noCredits: "कोई क्रेडिट नहीं",
    lowCredits: "कम क्रेडिट",
    creditsAvailable: "क्रेडिट उपलब्ध हैं",
    creditsUnavailable: "क्रेडिट उपलब्ध नहीं",
    emptyCreditsMessage:
      "इस स्टोर में Try-On क्रेडिट नहीं बचे हैं. क्रेडिट जोड़े जाने तक खरीदारों को अस्थायी अनुपलब्ध संदेश दिखेगा.",
    lowCreditsMessage:
      "इस स्टोर में {threshold} या उससे कम Try-On क्रेडिट बचे हैं.",
    maxTryOnsPerVisitor: "हर विजिटर के लिए अधिकतम ट्राय-ऑन",
    visitorLimitPeriod: "विजिटर लिमिट अवधि",
    monthlyStoreCap: "मासिक स्टोर कैप",
    storefrontWidgetLanguage: "स्टोरफ्रंट विजेट भाषा",
    adminPanelLanguage: "एडमिन पैनल भाषा",
    visitorLimitEnabled:
      "हर विजिटर {period} में अधिकतम {limit} Try-On इस्तेमाल कर सकता है.",
    visitorLimitsOff:
      "प्रति-विजिटर लिमिट बंद है. प्लान क्रेडिट फिर भी लागू रहेंगे.",
    monthlyStoreCapEnabled:
      "यह Shopify स्टोर हर कैलेंडर महीने में अधिकतम {limit} Try-On चला सकता है.",
    monthlyStoreCapOff:
      "कोई कस्टम मासिक कैप सेट नहीं है. SelfX प्लान क्रेडिट लिमिट फिर भी लागू रहेगी.",
    storefrontAutoHelp:
      "Auto उपलब्ध होने पर खरीदार की Shopify स्टोरफ्रंट भाषा का पालन करता है.",
    storefrontForcedHelp:
      "खरीदार SelfX Try-On लॉन्च पेज पर {language} देखेंगे.",
    currentAdminLanguage: "वर्तमान एडमिन भाषा: {language}.",
    currentStorefrontLanguage: "वर्तमान स्टोरफ्रंट भाषा: {language}.",
    arabicRtlNote: "Arabic में दाएं-से-बाएं लेआउट इस्तेमाल होता है.",
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
    refresh: "Actualiser",
    saveSettings: "Enregistrer",
    saving: "Enregistrement",
    settingsUpdated: "Parametres mis a jour",
    settingsFailed: "Echec de la mise a jour",
    totalTryOns: "Essayages totaux",
    thisMonth: "Ce mois-ci",
    availableCredits: "Credits disponibles",
    allShopifyStorefrontSessions: "Toutes les sessions boutique Shopify",
    generated: "{count} generees",
    noUsageYet: "Aucune utilisation",
    trial: "Essai",
    notConnected: "Non connecte",
    creditsLeft: "{available} credits restants sur {included}",
    viewPlans: "Voir les plans",
    openSelfxBilling: "Ouvrir la facturation SelfX",
    tryOnPaused: "Try-On est en pause",
    tryOnCreditsLow: "Credits Try-On faibles",
    noCredits: "Aucun credit",
    lowCredits: "Credits faibles",
    creditsAvailable: "Credits disponibles",
    creditsUnavailable: "Credits indisponibles",
    emptyCreditsMessage:
      "Cette boutique n'a plus de credits Try-On. Les clients verront un message temporaire d'indisponibilite jusqu'a l'ajout de credits.",
    lowCreditsMessage:
      "Cette boutique a {threshold} credits Try-On restants ou moins.",
    maxTryOnsPerVisitor: "Essayages max par visiteur",
    visitorLimitPeriod: "Periode de limite visiteur",
    monthlyStoreCap: "Plafond mensuel boutique",
    storefrontWidgetLanguage: "Langue du widget boutique",
    adminPanelLanguage: "Langue du panneau admin",
    visitorLimitEnabled:
      "Chaque visiteur peut utiliser jusqu'a {limit} Try-On par {period}.",
    visitorLimitsOff:
      "Les limites par visiteur sont desactivees. Les credits du plan s'appliquent toujours.",
    monthlyStoreCapEnabled:
      "Cette boutique Shopify peut lancer jusqu'a {limit} Try-On par mois calendaire.",
    monthlyStoreCapOff:
      "Aucun plafond mensuel personnalise. La limite de credits du plan SelfX reste appliquee.",
    storefrontAutoHelp:
      "Auto suit la langue de la boutique Shopify du client lorsqu'elle est disponible.",
    storefrontForcedHelp:
      "Les clients verront {language} sur la page de lancement SelfX Try-On.",
    currentAdminLanguage: "Langue admin actuelle : {language}.",
    currentStorefrontLanguage: "Langue boutique actuelle : {language}.",
    arabicRtlNote: "L'arabe utilise une mise en page de droite a gauche.",
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
    refresh: "Aktualisieren",
    saveSettings: "Einstellungen speichern",
    saving: "Speichern",
    settingsUpdated: "Einstellungen aktualisiert",
    settingsFailed: "Einstellungen konnten nicht gespeichert werden",
    totalTryOns: "Try-Ons gesamt",
    thisMonth: "Dieser Monat",
    availableCredits: "Verfugbare Credits",
    allShopifyStorefrontSessions: "Alle Shopify-Storefront-Sitzungen",
    generated: "{count} generiert",
    noUsageYet: "Noch keine Nutzung",
    trial: "Testversion",
    notConnected: "Nicht verbunden",
    creditsLeft: "{available} von {included} Credits ubrig",
    viewPlans: "Plane anzeigen",
    openSelfxBilling: "SelfX-Abrechnung offnen",
    tryOnPaused: "Try-On ist pausiert",
    tryOnCreditsLow: "Try-On-Credits sind niedrig",
    noCredits: "Keine Credits",
    lowCredits: "Niedrige Credits",
    creditsAvailable: "Credits verfugbar",
    creditsUnavailable: "Credits nicht verfugbar",
    emptyCreditsMessage:
      "Dieser Shop hat keine Try-On-Credits mehr. Kaufer sehen eine vorubergehende Nicht-verfugbar-Meldung, bis Credits hinzugefugt werden.",
    lowCreditsMessage:
      "Dieser Shop hat {threshold} oder weniger Try-On-Credits ubrig.",
    maxTryOnsPerVisitor: "Max. Anproben pro Besucher",
    visitorLimitPeriod: "Besucherlimit Zeitraum",
    monthlyStoreCap: "Monatliches Shop-Limit",
    storefrontWidgetLanguage: "Storefront Widget-Sprache",
    adminPanelLanguage: "Admin-Sprache",
    visitorLimitEnabled:
      "Jeder Besucher kann bis zu {limit} Try-Ons pro {period} verwenden.",
    visitorLimitsOff:
      "Besucherlimits sind deaktiviert. Plan-Credits gelten weiterhin.",
    monthlyStoreCapEnabled:
      "Dieser Shopify-Shop kann bis zu {limit} Try-Ons pro Kalendermonat ausfuhren.",
    monthlyStoreCapOff:
      "Kein eigenes Monatslimit festgelegt. Das SelfX-Plan-Creditlimit gilt weiterhin.",
    storefrontAutoHelp:
      "Auto folgt der Shopify-Storefront-Sprache des Kaufers, wenn verfugbar.",
    storefrontForcedHelp:
      "Kaufer sehen {language} auf der SelfX Try-On-Startseite.",
    currentAdminLanguage: "Aktuelle Admin-Sprache: {language}.",
    currentStorefrontLanguage: "Aktuelle Storefront-Sprache: {language}.",
    arabicRtlNote:
      "Arabisch verwendet ein Layout von rechts nach links.",
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
    refresh: "Atualizar",
    saveSettings: "Salvar configuracoes",
    saving: "Salvando",
    settingsUpdated: "Configuracoes atualizadas",
    settingsFailed: "Falha ao salvar configuracoes",
    totalTryOns: "Try-Ons totais",
    thisMonth: "Este mes",
    availableCredits: "Creditos disponiveis",
    allShopifyStorefrontSessions: "Todas as sessoes da vitrine Shopify",
    generated: "{count} geradas",
    noUsageYet: "Sem uso ainda",
    trial: "Teste",
    notConnected: "Nao conectado",
    creditsLeft: "{available} de {included} creditos restantes",
    viewPlans: "Ver planos",
    openSelfxBilling: "Abrir cobranca SelfX",
    tryOnPaused: "Try-On esta pausado",
    tryOnCreditsLow: "Creditos Try-On baixos",
    noCredits: "Sem creditos",
    lowCredits: "Creditos baixos",
    creditsAvailable: "Creditos disponiveis",
    creditsUnavailable: "Creditos indisponiveis",
    emptyCreditsMessage:
      "Esta loja nao tem creditos Try-On restantes. Os compradores verao uma mensagem temporaria de indisponivel ate que creditos sejam adicionados.",
    lowCreditsMessage:
      "Esta loja tem {threshold} ou menos creditos Try-On restantes.",
    maxTryOnsPerVisitor: "Maximo de provas por visitante",
    visitorLimitPeriod: "Periodo do limite por visitante",
    monthlyStoreCap: "Limite mensal da loja",
    storefrontWidgetLanguage: "Idioma do widget da loja",
    adminPanelLanguage: "Idioma do painel admin",
    visitorLimitEnabled:
      "Cada visitante pode usar ate {limit} Try-Ons por {period}.",
    visitorLimitsOff:
      "Limites por visitante estao desativados. Os creditos do plano ainda se aplicam.",
    monthlyStoreCapEnabled:
      "Esta loja Shopify pode executar ate {limit} Try-Ons por mes calendario.",
    monthlyStoreCapOff:
      "Nenhum limite mensal personalizado definido. O limite de creditos do plano SelfX ainda e aplicado.",
    storefrontAutoHelp:
      "Auto segue o idioma da vitrine Shopify do comprador quando disponivel.",
    storefrontForcedHelp:
      "Os compradores verao {language} na pagina de inicio do SelfX Try-On.",
    currentAdminLanguage: "Idioma admin atual: {language}.",
    currentStorefrontLanguage: "Idioma atual da vitrine: {language}.",
    arabicRtlNote: "Arabe usa layout da direita para a esquerda.",
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
    refresh: "Aggiorna",
    saveSettings: "Salva impostazioni",
    saving: "Salvataggio",
    settingsUpdated: "Impostazioni aggiornate",
    settingsFailed: "Aggiornamento impostazioni non riuscito",
    totalTryOns: "Try-On totali",
    thisMonth: "Questo mese",
    availableCredits: "Crediti disponibili",
    allShopifyStorefrontSessions: "Tutte le sessioni storefront Shopify",
    generated: "{count} generate",
    noUsageYet: "Nessun uso",
    trial: "Prova",
    notConnected: "Non connesso",
    creditsLeft: "{available} di {included} crediti rimasti",
    viewPlans: "Vedi piani",
    openSelfxBilling: "Apri fatturazione SelfX",
    tryOnPaused: "Try-On in pausa",
    tryOnCreditsLow: "Crediti Try-On bassi",
    noCredits: "Nessun credito",
    lowCredits: "Crediti bassi",
    creditsAvailable: "Crediti disponibili",
    creditsUnavailable: "Crediti non disponibili",
    emptyCreditsMessage:
      "Questo negozio non ha piu crediti Try-On. Gli acquirenti vedranno un messaggio temporaneo di non disponibilita finche non verranno aggiunti crediti.",
    lowCreditsMessage:
      "Questo negozio ha {threshold} o meno crediti Try-On rimasti.",
    maxTryOnsPerVisitor: "Try-On massimi per visitatore",
    visitorLimitPeriod: "Periodo limite visitatore",
    monthlyStoreCap: "Limite mensile negozio",
    storefrontWidgetLanguage: "Lingua widget storefront",
    adminPanelLanguage: "Lingua pannello admin",
    visitorLimitEnabled:
      "Ogni visitatore puo usare fino a {limit} Try-On per {period}.",
    visitorLimitsOff:
      "I limiti per visitatore sono disattivati. I crediti del piano restano applicati.",
    monthlyStoreCapEnabled:
      "Questo negozio Shopify puo eseguire fino a {limit} Try-On per mese di calendario.",
    monthlyStoreCapOff:
      "Nessun limite mensile personalizzato impostato. Il limite crediti del piano SelfX resta applicato.",
    storefrontAutoHelp:
      "Auto segue la lingua dello storefront Shopify dell'acquirente quando disponibile.",
    storefrontForcedHelp:
      "Gli acquirenti vedranno {language} nella pagina di avvio SelfX Try-On.",
    currentAdminLanguage: "Lingua admin attuale: {language}.",
    currentStorefrontLanguage: "Lingua storefront attuale: {language}.",
    arabicRtlNote: "L'arabo usa un layout da destra a sinistra.",
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

export function adminFormat(
  locale: string | null | undefined,
  key: AdminTextKey,
  replacements: Record<string, string | number>,
): string {
  return Object.entries(replacements).reduce(
    (text, [name, value]) =>
      text.replaceAll(`{${name}}`, String(value)),
    adminT(locale, key),
  );
}
