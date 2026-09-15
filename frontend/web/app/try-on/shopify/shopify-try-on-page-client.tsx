"use client";

import { useEffect, useRef, useState } from "react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SelfxLogo,
} from "@selfx/ui";
import {
  CameraIcon,
  CheckCircle2Icon,
  DownloadIcon,
  ImageIcon,
  LoaderCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UploadIcon,
} from "lucide-react";

import { SafeApiError } from "@/lib/api";
import {
  createShopifyTryOnRun,
  getShopifyTryOnSession,
  getShopifyTryOnRun,
  uploadShopifyTryOnPersonImage,
  type ShopifyTryOnRun,
  type ShopifyTryOnSession,
} from "@/lib/shopify-storefront-try-on-api";

type PageState =
  | { status: "INVALID" }
  | { status: "LOADING" }
  | { status: "READY"; session: ShopifyTryOnSession }
  | {
      status: "PHOTO_READY";
      session: ShopifyTryOnSession;
      previewUrl: string;
    }
  | {
      status: "RUNNING";
      session: ShopifyTryOnSession;
      previewUrl: string;
      run: ShopifyTryOnRun;
    }
  | {
      status: "COMPLETED";
      session: ShopifyTryOnSession;
      previewUrl: string;
      run: ShopifyTryOnRun;
    }
  | { status: "ERROR"; message: string; session?: ShopifyTryOnSession };

const supportedTypes = ["image/jpeg", "image/png", "image/webp"];

type ShopifyTryOnLocale = "en" | "es" | "ar" | "hi" | "fr" | "de" | "pt" | "it";

type ShopifyTryOnCopy = {
  secureSession: string;
  title: string;
  invalidDescription: string;
  readyDescription: string;
  productStep: string;
  photoStep: string;
  resultStep: string;
  preparing: string;
  unavailableTitle: string;
  productFallback: string;
  consent: string;
  takePhoto: string;
  uploadPhoto: string;
  startTryOn: string;
  starting: string;
  creatingTryOn: string;
  inputsTitle: string;
  inputsDescription: string;
  inputsReady: string;
  photoNeeded: string;
  reviewInputsTitle: string;
  reviewInputsBody: string;
  productTitle: string;
  productImageUnavailable: string;
  yourPhotoTitle: string;
  uploadedImage: string;
  waitingForImage: string;
  uploadedPhotoWillAppear: string;
  resultTitle: string;
  resultReadyDescription: string;
  resultPendingDescription: string;
  generatedImageTitle: string;
  selfxResult: string;
  generatingTryOn: string;
  noResultYet: string;
  creatingVirtualTryOn: string;
  addPhotoThenStart: string;
  preparingDownload: string;
  download: string;
  ready: string;
  working: string;
  pending: string;
  invalidLinkTitle: string;
  invalidLinkBody: string;
  chooseSupportedPhoto: string;
  sessionNotReady: string;
  resultNotReadyToDownload: string;
  temporarilyUnavailable: string;
  productNotEnabled: string;
  personRequired: string;
  uploadsNotConfigured: string;
  genericFailure: string;
  runFailed: string;
  statusPreparing: string;
  statusProductReady: string;
  statusPhotoReady: string;
  statusGenerating: string;
  statusComplete: string;
  statusUnavailable: string;
};

const shopifyTryOnCopies: Record<ShopifyTryOnLocale, ShopifyTryOnCopy> = {
  en: {
    secureSession: "Secure session",
    title: "SelfX Try-On",
    invalidDescription: "This Try-On link is missing a valid session.",
    readyDescription: "Your Shopify product is ready for virtual try-on.",
    productStep: "Product",
    photoStep: "Photo",
    resultStep: "Result",
    preparing: "Preparing Try-On...",
    unavailableTitle: "Try-On unavailable",
    productFallback: "Shopify product",
    consent: "I consent to SelfX processing my photo to generate this virtual try-on.",
    takePhoto: "Take Photo",
    uploadPhoto: "Upload Photo",
    startTryOn: "Start Try-On",
    starting: "Starting...",
    creatingTryOn: "Creating your Try-On...",
    inputsTitle: "Inputs",
    inputsDescription: "Product image and shopper photo used for this Try-On.",
    inputsReady: "Inputs ready",
    photoNeeded: "Photo needed",
    reviewInputsTitle: "Review your Try-On inputs",
    reviewInputsBody:
      "SelfX combines the synced Shopify product image with your uploaded photo to create the generated result.",
    productTitle: "Product",
    productImageUnavailable: "Product image unavailable",
    yourPhotoTitle: "Your Photo",
    uploadedImage: "Uploaded image",
    waitingForImage: "Waiting for your image",
    uploadedPhotoWillAppear: "Your uploaded photo will appear here",
    resultTitle: "Try-On Result",
    resultReadyDescription: "Your generated SelfX image is ready.",
    resultPendingDescription: "The generated image will appear here.",
    generatedImageTitle: "Generated Image",
    selfxResult: "SelfX result",
    generatingTryOn: "Generating try-on",
    noResultYet: "No result yet",
    creatingVirtualTryOn: "Creating your virtual try-on",
    addPhotoThenStart: "Add your photo, then start Try-On",
    preparingDownload: "Preparing...",
    download: "Download",
    ready: "Ready",
    working: "Working",
    pending: "Pending",
    invalidLinkTitle: "Invalid Try-On link",
    invalidLinkBody: "Return to the product page and select Try It On again.",
    chooseSupportedPhoto: "Choose a JPG, PNG or WebP photo.",
    sessionNotReady: "Try-On session is not ready yet.",
    resultNotReadyToDownload: "Your Try-On result is not ready to download yet.",
    temporarilyUnavailable:
      "Try-On is temporarily unavailable for this store. Please try again later.",
    productNotEnabled: "This product is not enabled for SelfX Try-On yet.",
    personRequired: "Add your photo before starting Try-On.",
    uploadsNotConfigured: "SelfX uploads are not configured yet.",
    genericFailure: "Try-On could not be completed right now.",
    runFailed: "Try-On could not be completed.",
    statusPreparing: "Preparing",
    statusProductReady: "Product ready",
    statusPhotoReady: "Photo ready",
    statusGenerating: "Generating",
    statusComplete: "Complete",
    statusUnavailable: "Unavailable",
  },
  es: {
    secureSession: "Sesion segura",
    title: "SelfX Try-On",
    invalidDescription: "A este enlace de prueba le falta una sesion valida.",
    readyDescription: "Tu producto de Shopify esta listo para la prueba virtual.",
    productStep: "Producto",
    photoStep: "Foto",
    resultStep: "Resultado",
    preparing: "Preparando prueba...",
    unavailableTitle: "Prueba no disponible",
    productFallback: "Producto de Shopify",
    consent: "Acepto que SelfX procese mi foto para generar esta prueba virtual.",
    takePhoto: "Tomar foto",
    uploadPhoto: "Subir foto",
    startTryOn: "Iniciar prueba",
    starting: "Iniciando...",
    creatingTryOn: "Creando tu prueba...",
    inputsTitle: "Entradas",
    inputsDescription: "Imagen del producto y foto del comprador usadas para esta prueba.",
    inputsReady: "Entradas listas",
    photoNeeded: "Foto necesaria",
    reviewInputsTitle: "Revisa tus entradas de prueba",
    reviewInputsBody:
      "SelfX combina la imagen sincronizada del producto de Shopify con tu foto subida para crear el resultado generado.",
    productTitle: "Producto",
    productImageUnavailable: "Imagen del producto no disponible",
    yourPhotoTitle: "Tu foto",
    uploadedImage: "Imagen subida",
    waitingForImage: "Esperando tu imagen",
    uploadedPhotoWillAppear: "Tu foto subida aparecera aqui",
    resultTitle: "Resultado de prueba",
    resultReadyDescription: "Tu imagen generada por SelfX esta lista.",
    resultPendingDescription: "La imagen generada aparecera aqui.",
    generatedImageTitle: "Imagen generada",
    selfxResult: "Resultado SelfX",
    generatingTryOn: "Generando prueba",
    noResultYet: "Aun no hay resultado",
    creatingVirtualTryOn: "Creando tu prueba virtual",
    addPhotoThenStart: "Agrega tu foto y luego inicia la prueba",
    preparingDownload: "Preparando...",
    download: "Descargar",
    ready: "Listo",
    working: "Procesando",
    pending: "Pendiente",
    invalidLinkTitle: "Enlace de prueba invalido",
    invalidLinkBody: "Vuelve a la pagina del producto y selecciona Try It On otra vez.",
    chooseSupportedPhoto: "Elige una foto JPG, PNG o WebP.",
    sessionNotReady: "La sesion de prueba aun no esta lista.",
    resultNotReadyToDownload: "Tu resultado aun no esta listo para descargar.",
    temporarilyUnavailable: "La prueba no esta disponible temporalmente. Intentalo mas tarde.",
    productNotEnabled: "Este producto aun no esta habilitado para SelfX Try-On.",
    personRequired: "Agrega tu foto antes de iniciar la prueba.",
    uploadsNotConfigured: "Las subidas de SelfX aun no estan configuradas.",
    genericFailure: "La prueba no pudo completarse ahora.",
    runFailed: "La prueba no pudo completarse.",
    statusPreparing: "Preparando",
    statusProductReady: "Producto listo",
    statusPhotoReady: "Foto lista",
    statusGenerating: "Generando",
    statusComplete: "Completo",
    statusUnavailable: "No disponible",
  },
  ar: {
    secureSession: "جلسة آمنة",
    title: "تجربة SelfX",
    invalidDescription: "رابط التجربة لا يحتوي على جلسة صالحة.",
    readyDescription: "منتج Shopify جاهز للتجربة الافتراضية.",
    productStep: "المنتج",
    photoStep: "الصورة",
    resultStep: "النتيجة",
    preparing: "جار تجهيز التجربة...",
    unavailableTitle: "التجربة غير متاحة",
    productFallback: "منتج Shopify",
    consent: "أوافق على معالجة SelfX لصورتي لإنشاء هذه التجربة الافتراضية.",
    takePhoto: "التقاط صورة",
    uploadPhoto: "رفع صورة",
    startTryOn: "بدء التجربة",
    starting: "جار البدء...",
    creatingTryOn: "جار إنشاء التجربة...",
    inputsTitle: "المدخلات",
    inputsDescription: "صورة المنتج وصورة المتسوق المستخدمة لهذه التجربة.",
    inputsReady: "المدخلات جاهزة",
    photoNeeded: "الصورة مطلوبة",
    reviewInputsTitle: "راجع مدخلات التجربة",
    reviewInputsBody:
      "تجمع SelfX صورة منتج Shopify المتزامنة مع صورتك المرفوعة لإنشاء النتيجة.",
    productTitle: "المنتج",
    productImageUnavailable: "صورة المنتج غير متاحة",
    yourPhotoTitle: "صورتك",
    uploadedImage: "الصورة المرفوعة",
    waitingForImage: "بانتظار صورتك",
    uploadedPhotoWillAppear: "ستظهر صورتك المرفوعة هنا",
    resultTitle: "نتيجة التجربة",
    resultReadyDescription: "صورة SelfX التي تم إنشاؤها جاهزة.",
    resultPendingDescription: "ستظهر الصورة التي تم إنشاؤها هنا.",
    generatedImageTitle: "الصورة الناتجة",
    selfxResult: "نتيجة SelfX",
    generatingTryOn: "جار إنشاء التجربة",
    noResultYet: "لا توجد نتيجة بعد",
    creatingVirtualTryOn: "جار إنشاء تجربتك الافتراضية",
    addPhotoThenStart: "أضف صورتك ثم ابدأ التجربة",
    preparingDownload: "جار التحضير...",
    download: "تنزيل",
    ready: "جاهز",
    working: "جار العمل",
    pending: "قيد الانتظار",
    invalidLinkTitle: "رابط تجربة غير صالح",
    invalidLinkBody: "ارجع إلى صفحة المنتج واختر Try It On مرة أخرى.",
    chooseSupportedPhoto: "اختر صورة JPG أو PNG أو WebP.",
    sessionNotReady: "جلسة التجربة ليست جاهزة بعد.",
    resultNotReadyToDownload: "نتيجة التجربة ليست جاهزة للتنزيل بعد.",
    temporarilyUnavailable: "التجربة غير متاحة مؤقتا لهذا المتجر. حاول لاحقا.",
    productNotEnabled: "هذا المنتج غير مفعل بعد لتجربة SelfX.",
    personRequired: "أضف صورتك قبل بدء التجربة.",
    uploadsNotConfigured: "رفع الصور في SelfX غير مهيأ بعد.",
    genericFailure: "تعذر إكمال التجربة الآن.",
    runFailed: "تعذر إكمال التجربة.",
    statusPreparing: "جار التحضير",
    statusProductReady: "المنتج جاهز",
    statusPhotoReady: "الصورة جاهزة",
    statusGenerating: "جار الإنشاء",
    statusComplete: "مكتمل",
    statusUnavailable: "غير متاح",
  },
  hi: {
    secureSession: "सुरक्षित सेशन",
    title: "SelfX Try-On",
    invalidDescription: "इस Try-On लिंक में मान्य सेशन नहीं है.",
    readyDescription: "आपका Shopify उत्पाद वर्चुअल ट्राय-ऑन के लिए तैयार है.",
    productStep: "उत्पाद",
    photoStep: "फोटो",
    resultStep: "परिणाम",
    preparing: "Try-On तैयार हो रहा है...",
    unavailableTitle: "Try-On उपलब्ध नहीं है",
    productFallback: "Shopify उत्पाद",
    consent: "मैं इस वर्चुअल try-on को बनाने के लिए SelfX को मेरी फोटो प्रोसेस करने की सहमति देता/देती हूं.",
    takePhoto: "फोटो लें",
    uploadPhoto: "फोटो अपलोड करें",
    startTryOn: "Try-On शुरू करें",
    starting: "शुरू हो रहा है...",
    creatingTryOn: "आपका Try-On बन रहा है...",
    inputsTitle: "इनपुट",
    inputsDescription: "इस Try-On के लिए उत्पाद छवि और खरीदार की फोटो.",
    inputsReady: "इनपुट तैयार",
    photoNeeded: "फोटो चाहिए",
    reviewInputsTitle: "अपने Try-On इनपुट देखें",
    reviewInputsBody:
      "SelfX Shopify उत्पाद की सिंक की गई छवि को आपकी अपलोड की गई फोटो के साथ मिलाकर परिणाम बनाता है.",
    productTitle: "उत्पाद",
    productImageUnavailable: "उत्पाद छवि उपलब्ध नहीं है",
    yourPhotoTitle: "आपकी फोटो",
    uploadedImage: "अपलोड की गई छवि",
    waitingForImage: "आपकी छवि का इंतजार है",
    uploadedPhotoWillAppear: "आपकी अपलोड की गई फोटो यहां दिखाई देगी",
    resultTitle: "Try-On परिणाम",
    resultReadyDescription: "आपकी SelfX जनरेट की गई छवि तैयार है.",
    resultPendingDescription: "जनरेट की गई छवि यहां दिखाई देगी.",
    generatedImageTitle: "जनरेट की गई छवि",
    selfxResult: "SelfX परिणाम",
    generatingTryOn: "Try-On जनरेट हो रहा है",
    noResultYet: "अभी कोई परिणाम नहीं",
    creatingVirtualTryOn: "आपका वर्चुअल try-on बन रहा है",
    addPhotoThenStart: "अपनी फोटो जोड़ें, फिर Try-On शुरू करें",
    preparingDownload: "तैयार हो रहा है...",
    download: "डाउनलोड",
    ready: "तैयार",
    working: "काम हो रहा है",
    pending: "लंबित",
    invalidLinkTitle: "अमान्य Try-On लिंक",
    invalidLinkBody: "उत्पाद पेज पर वापस जाएं और Try It On फिर से चुनें.",
    chooseSupportedPhoto: "JPG, PNG या WebP फोटो चुनें.",
    sessionNotReady: "Try-On सेशन अभी तैयार नहीं है.",
    resultNotReadyToDownload: "आपका Try-On परिणाम अभी डाउनलोड के लिए तैयार नहीं है.",
    temporarilyUnavailable: "इस स्टोर के लिए Try-On अस्थायी रूप से उपलब्ध नहीं है. बाद में फिर कोशिश करें.",
    productNotEnabled: "यह उत्पाद अभी SelfX Try-On के लिए सक्षम नहीं है.",
    personRequired: "Try-On शुरू करने से पहले अपनी फोटो जोड़ें.",
    uploadsNotConfigured: "SelfX अपलोड अभी कॉन्फिगर नहीं हैं.",
    genericFailure: "Try-On अभी पूरा नहीं हो सका.",
    runFailed: "Try-On पूरा नहीं हो सका.",
    statusPreparing: "तैयार हो रहा है",
    statusProductReady: "उत्पाद तैयार",
    statusPhotoReady: "फोटो तैयार",
    statusGenerating: "जनरेट हो रहा है",
    statusComplete: "पूरा",
    statusUnavailable: "उपलब्ध नहीं",
  },
  fr: {
    secureSession: "Session securisee",
    title: "SelfX Try-On",
    invalidDescription: "Ce lien Try-On ne contient pas de session valide.",
    readyDescription: "Votre produit Shopify est pret pour l'essayage virtuel.",
    productStep: "Produit",
    photoStep: "Photo",
    resultStep: "Resultat",
    preparing: "Preparation du Try-On...",
    unavailableTitle: "Try-On indisponible",
    productFallback: "Produit Shopify",
    consent: "J'accepte que SelfX traite ma photo pour generer cet essayage virtuel.",
    takePhoto: "Prendre une photo",
    uploadPhoto: "Importer une photo",
    startTryOn: "Demarrer Try-On",
    starting: "Demarrage...",
    creatingTryOn: "Creation de votre Try-On...",
    inputsTitle: "Entrees",
    inputsDescription: "Image produit et photo client utilisees pour ce Try-On.",
    inputsReady: "Entrees pretes",
    photoNeeded: "Photo requise",
    reviewInputsTitle: "Verifier vos entrees Try-On",
    reviewInputsBody:
      "SelfX combine l'image produit Shopify synchronisee avec votre photo importee pour creer le resultat.",
    productTitle: "Produit",
    productImageUnavailable: "Image produit indisponible",
    yourPhotoTitle: "Votre photo",
    uploadedImage: "Image importee",
    waitingForImage: "En attente de votre image",
    uploadedPhotoWillAppear: "Votre photo importee apparaitra ici",
    resultTitle: "Resultat Try-On",
    resultReadyDescription: "Votre image SelfX generee est prete.",
    resultPendingDescription: "L'image generee apparaitra ici.",
    generatedImageTitle: "Image generee",
    selfxResult: "Resultat SelfX",
    generatingTryOn: "Generation du Try-On",
    noResultYet: "Aucun resultat pour le moment",
    creatingVirtualTryOn: "Creation de votre essayage virtuel",
    addPhotoThenStart: "Ajoutez votre photo, puis demarrez Try-On",
    preparingDownload: "Preparation...",
    download: "Telecharger",
    ready: "Pret",
    working: "En cours",
    pending: "En attente",
    invalidLinkTitle: "Lien Try-On invalide",
    invalidLinkBody: "Retournez a la page produit et selectionnez Try It On a nouveau.",
    chooseSupportedPhoto: "Choisissez une photo JPG, PNG ou WebP.",
    sessionNotReady: "La session Try-On n'est pas encore prete.",
    resultNotReadyToDownload: "Votre resultat Try-On n'est pas encore pret a telecharger.",
    temporarilyUnavailable: "Try-On est temporairement indisponible pour cette boutique. Reessayez plus tard.",
    productNotEnabled: "Ce produit n'est pas encore active pour SelfX Try-On.",
    personRequired: "Ajoutez votre photo avant de demarrer Try-On.",
    uploadsNotConfigured: "Les imports SelfX ne sont pas encore configures.",
    genericFailure: "Try-On n'a pas pu etre termine maintenant.",
    runFailed: "Try-On n'a pas pu etre termine.",
    statusPreparing: "Preparation",
    statusProductReady: "Produit pret",
    statusPhotoReady: "Photo prete",
    statusGenerating: "Generation",
    statusComplete: "Termine",
    statusUnavailable: "Indisponible",
  },
  de: {
    secureSession: "Sichere Sitzung",
    title: "SelfX Try-On",
    invalidDescription: "Diesem Try-On-Link fehlt eine gueltige Sitzung.",
    readyDescription: "Dein Shopify-Produkt ist bereit fuer die virtuelle Anprobe.",
    productStep: "Produkt",
    photoStep: "Foto",
    resultStep: "Ergebnis",
    preparing: "Try-On wird vorbereitet...",
    unavailableTitle: "Try-On nicht verfuegbar",
    productFallback: "Shopify-Produkt",
    consent: "Ich stimme zu, dass SelfX mein Foto verarbeitet, um diese virtuelle Anprobe zu erstellen.",
    takePhoto: "Foto aufnehmen",
    uploadPhoto: "Foto hochladen",
    startTryOn: "Try-On starten",
    starting: "Startet...",
    creatingTryOn: "Dein Try-On wird erstellt...",
    inputsTitle: "Eingaben",
    inputsDescription: "Produktbild und Kundenfoto fuer diesen Try-On.",
    inputsReady: "Eingaben bereit",
    photoNeeded: "Foto benoetigt",
    reviewInputsTitle: "Try-On-Eingaben pruefen",
    reviewInputsBody:
      "SelfX kombiniert das synchronisierte Shopify-Produktbild mit deinem hochgeladenen Foto.",
    productTitle: "Produkt",
    productImageUnavailable: "Produktbild nicht verfuegbar",
    yourPhotoTitle: "Dein Foto",
    uploadedImage: "Hochgeladenes Bild",
    waitingForImage: "Warten auf dein Bild",
    uploadedPhotoWillAppear: "Dein hochgeladenes Foto erscheint hier",
    resultTitle: "Try-On-Ergebnis",
    resultReadyDescription: "Dein generiertes SelfX-Bild ist bereit.",
    resultPendingDescription: "Das generierte Bild erscheint hier.",
    generatedImageTitle: "Generiertes Bild",
    selfxResult: "SelfX-Ergebnis",
    generatingTryOn: "Try-On wird generiert",
    noResultYet: "Noch kein Ergebnis",
    creatingVirtualTryOn: "Deine virtuelle Anprobe wird erstellt",
    addPhotoThenStart: "Fuege dein Foto hinzu und starte Try-On",
    preparingDownload: "Vorbereitung...",
    download: "Herunterladen",
    ready: "Bereit",
    working: "In Arbeit",
    pending: "Ausstehend",
    invalidLinkTitle: "Ungueltiger Try-On-Link",
    invalidLinkBody: "Gehe zur Produktseite zurueck und waehle Try It On erneut.",
    chooseSupportedPhoto: "Waehle ein JPG-, PNG- oder WebP-Foto.",
    sessionNotReady: "Die Try-On-Sitzung ist noch nicht bereit.",
    resultNotReadyToDownload: "Dein Try-On-Ergebnis ist noch nicht zum Download bereit.",
    temporarilyUnavailable: "Try-On ist fuer diesen Shop voruebergehend nicht verfuegbar. Bitte spaeter erneut versuchen.",
    productNotEnabled: "Dieses Produkt ist noch nicht fuer SelfX Try-On aktiviert.",
    personRequired: "Fuege dein Foto hinzu, bevor du Try-On startest.",
    uploadsNotConfigured: "SelfX-Uploads sind noch nicht konfiguriert.",
    genericFailure: "Try-On konnte gerade nicht abgeschlossen werden.",
    runFailed: "Try-On konnte nicht abgeschlossen werden.",
    statusPreparing: "Vorbereitung",
    statusProductReady: "Produkt bereit",
    statusPhotoReady: "Foto bereit",
    statusGenerating: "Generiert",
    statusComplete: "Fertig",
    statusUnavailable: "Nicht verfuegbar",
  },
  pt: {
    secureSession: "Sessao segura",
    title: "SelfX Try-On",
    invalidDescription: "Este link de Try-On nao tem uma sessao valida.",
    readyDescription: "Seu produto Shopify esta pronto para a prova virtual.",
    productStep: "Produto",
    photoStep: "Foto",
    resultStep: "Resultado",
    preparing: "Preparando Try-On...",
    unavailableTitle: "Try-On indisponivel",
    productFallback: "Produto Shopify",
    consent: "Concordo que a SelfX processe minha foto para gerar esta prova virtual.",
    takePhoto: "Tirar foto",
    uploadPhoto: "Enviar foto",
    startTryOn: "Iniciar Try-On",
    starting: "Iniciando...",
    creatingTryOn: "Criando seu Try-On...",
    inputsTitle: "Entradas",
    inputsDescription: "Imagem do produto e foto do comprador usadas neste Try-On.",
    inputsReady: "Entradas prontas",
    photoNeeded: "Foto necessaria",
    reviewInputsTitle: "Revise suas entradas do Try-On",
    reviewInputsBody:
      "A SelfX combina a imagem sincronizada do produto Shopify com sua foto enviada para criar o resultado.",
    productTitle: "Produto",
    productImageUnavailable: "Imagem do produto indisponivel",
    yourPhotoTitle: "Sua foto",
    uploadedImage: "Imagem enviada",
    waitingForImage: "Aguardando sua imagem",
    uploadedPhotoWillAppear: "Sua foto enviada aparecera aqui",
    resultTitle: "Resultado do Try-On",
    resultReadyDescription: "Sua imagem gerada pela SelfX esta pronta.",
    resultPendingDescription: "A imagem gerada aparecera aqui.",
    generatedImageTitle: "Imagem gerada",
    selfxResult: "Resultado SelfX",
    generatingTryOn: "Gerando Try-On",
    noResultYet: "Ainda sem resultado",
    creatingVirtualTryOn: "Criando sua prova virtual",
    addPhotoThenStart: "Adicione sua foto e inicie o Try-On",
    preparingDownload: "Preparando...",
    download: "Baixar",
    ready: "Pronto",
    working: "Processando",
    pending: "Pendente",
    invalidLinkTitle: "Link de Try-On invalido",
    invalidLinkBody: "Volte para a pagina do produto e selecione Try It On novamente.",
    chooseSupportedPhoto: "Escolha uma foto JPG, PNG ou WebP.",
    sessionNotReady: "A sessao de Try-On ainda nao esta pronta.",
    resultNotReadyToDownload: "Seu resultado de Try-On ainda nao esta pronto para baixar.",
    temporarilyUnavailable: "Try-On esta temporariamente indisponivel para esta loja. Tente novamente mais tarde.",
    productNotEnabled: "Este produto ainda nao esta ativado para SelfX Try-On.",
    personRequired: "Adicione sua foto antes de iniciar o Try-On.",
    uploadsNotConfigured: "Os uploads da SelfX ainda nao estao configurados.",
    genericFailure: "Try-On nao pode ser concluido agora.",
    runFailed: "Try-On nao pode ser concluido.",
    statusPreparing: "Preparando",
    statusProductReady: "Produto pronto",
    statusPhotoReady: "Foto pronta",
    statusGenerating: "Gerando",
    statusComplete: "Completo",
    statusUnavailable: "Indisponivel",
  },
  it: {
    secureSession: "Sessione sicura",
    title: "SelfX Try-On",
    invalidDescription: "Questo link Try-On non contiene una sessione valida.",
    readyDescription: "Il tuo prodotto Shopify e pronto per la prova virtuale.",
    productStep: "Prodotto",
    photoStep: "Foto",
    resultStep: "Risultato",
    preparing: "Preparazione Try-On...",
    unavailableTitle: "Try-On non disponibile",
    productFallback: "Prodotto Shopify",
    consent: "Acconsento al trattamento della mia foto da parte di SelfX per generare questa prova virtuale.",
    takePhoto: "Scatta foto",
    uploadPhoto: "Carica foto",
    startTryOn: "Avvia Try-On",
    starting: "Avvio...",
    creatingTryOn: "Creazione del tuo Try-On...",
    inputsTitle: "Input",
    inputsDescription: "Immagine prodotto e foto shopper usate per questo Try-On.",
    inputsReady: "Input pronti",
    photoNeeded: "Foto necessaria",
    reviewInputsTitle: "Controlla gli input Try-On",
    reviewInputsBody:
      "SelfX combina l'immagine sincronizzata del prodotto Shopify con la foto caricata per creare il risultato.",
    productTitle: "Prodotto",
    productImageUnavailable: "Immagine prodotto non disponibile",
    yourPhotoTitle: "La tua foto",
    uploadedImage: "Immagine caricata",
    waitingForImage: "In attesa della tua immagine",
    uploadedPhotoWillAppear: "La tua foto caricata apparira qui",
    resultTitle: "Risultato Try-On",
    resultReadyDescription: "La tua immagine SelfX generata e pronta.",
    resultPendingDescription: "L'immagine generata apparira qui.",
    generatedImageTitle: "Immagine generata",
    selfxResult: "Risultato SelfX",
    generatingTryOn: "Generazione Try-On",
    noResultYet: "Nessun risultato ancora",
    creatingVirtualTryOn: "Creazione della prova virtuale",
    addPhotoThenStart: "Aggiungi la tua foto, poi avvia Try-On",
    preparingDownload: "Preparazione...",
    download: "Scarica",
    ready: "Pronto",
    working: "In corso",
    pending: "In attesa",
    invalidLinkTitle: "Link Try-On non valido",
    invalidLinkBody: "Torna alla pagina prodotto e seleziona di nuovo Try It On.",
    chooseSupportedPhoto: "Scegli una foto JPG, PNG o WebP.",
    sessionNotReady: "La sessione Try-On non e ancora pronta.",
    resultNotReadyToDownload: "Il risultato Try-On non e ancora pronto per il download.",
    temporarilyUnavailable: "Try-On e temporaneamente non disponibile per questo negozio. Riprova piu tardi.",
    productNotEnabled: "Questo prodotto non e ancora abilitato per SelfX Try-On.",
    personRequired: "Aggiungi la tua foto prima di avviare Try-On.",
    uploadsNotConfigured: "I caricamenti SelfX non sono ancora configurati.",
    genericFailure: "Try-On non puo essere completato ora.",
    runFailed: "Try-On non puo essere completato.",
    statusPreparing: "Preparazione",
    statusProductReady: "Prodotto pronto",
    statusPhotoReady: "Foto pronta",
    statusGenerating: "Generazione",
    statusComplete: "Completo",
    statusUnavailable: "Non disponibile",
  },
};

export function ShopifyTryOnPageClient({
  sessionToken,
}: {
  sessionToken: string | null;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<PageState>(() =>
    validSessionToken(sessionToken)
      ? { status: "LOADING" }
      : { status: "INVALID" },
  );
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const session = sessionFrom(state);
  const locale = localeFor(session?.locale);
  const copy = shopifyTryOnCopies[locale];
  const dir = locale === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    if (!validSessionToken(sessionToken)) {
      return;
    }
    let cancelled = false;
    setState({ status: "LOADING" });
    getShopifyTryOnSession(sessionToken)
      .then((session) => {
        if (!cancelled) {
          setState({ status: "READY", session });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ status: "ERROR", message: messageFor(error, copy) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (state.status !== "RUNNING") {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await getShopifyTryOnRun(state.session.session, state.run.id);
        if (cancelled) {
          return;
        }
        if (next.status === "COMPLETED" && next.result) {
          setState({
            status: "COMPLETED",
            session: state.session,
            previewUrl: state.previewUrl,
            run: next,
          });
          return;
        }
        if (next.status === "FAILED") {
          setState({
            status: "ERROR",
            session: state.session,
            message: runFailureMessage(next, copy),
          });
          return;
        }
        setState({
          status: "RUNNING",
          session: state.session,
          previewUrl: state.previewUrl,
          run: next,
        });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "ERROR",
            session: state.session,
            message: messageFor(error, copy),
          });
        }
      }
    };
    const timer = window.setInterval(() => {
      void poll();
    }, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [state]);

  async function selectPersonImage(file: File | undefined) {
    setMessage(null);
    if (!file || busy || !consented) {
      return;
    }
    if (!supportedTypes.includes(file.type) || file.size <= 0) {
      setMessage(copy.chooseSupportedPhoto);
      return;
    }
    const session = sessionFrom(state);
    if (!session) {
      setMessage(copy.sessionNotReady);
      return;
    }
    setBusy(true);
    const nextPreviewUrl = URL.createObjectURL(file);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(nextPreviewUrl);
    try {
      await uploadShopifyTryOnPersonImage(session.session, file);
      setState({
        status: "PHOTO_READY",
        session,
        previewUrl: nextPreviewUrl,
      });
    } catch (error) {
      URL.revokeObjectURL(nextPreviewUrl);
      setPreviewUrl(null);
      setMessage(messageFor(error, copy));
    } finally {
      setBusy(false);
    }
  }

  async function startTryOn() {
    if (busy || state.status !== "PHOTO_READY") {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const run = await createShopifyTryOnRun(state.session.session);
      setState({
        status: "RUNNING",
        session: state.session,
        previewUrl: state.previewUrl,
        run,
      });
    } catch (error) {
      setMessage(messageFor(error, copy));
    } finally {
      setBusy(false);
    }
  }

  async function downloadResult() {
    if (downloading || state.status !== "COMPLETED") {
      return;
    }
    setDownloading(true);
    setMessage(null);
    try {
      const refreshedRun = await getShopifyTryOnRun(
        state.session.session,
        state.run.id,
      );
      if (!refreshedRun.result?.readUrl) {
        setMessage(copy.resultNotReadyToDownload);
        return;
      }
      setState({
        status: "COMPLETED",
        session: state.session,
        previewUrl: state.previewUrl,
        run: refreshedRun,
      });
      const link = document.createElement("a");
      link.href = refreshedRun.result.downloadUrl ?? refreshedRun.result.readUrl;
      link.download = downloadFilename(refreshedRun);
      link.rel = "noopener noreferrer";
      document.body.append(link);
      link.click();
      link.remove();
    } catch (error) {
      setMessage(messageFor(error, copy));
    } finally {
      setDownloading(false);
    }
  }

  const productLabel =
    session?.product.handle ??
    session?.product.externalProductId;
  const isActiveSession =
    state.status !== "INVALID" &&
    state.status !== "LOADING" &&
    state.status !== "ERROR";

  return (
    <main
      dir={dir}
      lang={locale}
      className="min-h-dvh bg-[#f4f8f8] px-4 py-6 text-foreground sm:px-6 lg:py-8"
    >
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-[1500px] gap-5 xl:grid-cols-[420px_minmax(0,1fr)] xl:items-start">
        <Card className="w-full overflow-hidden border-border/70 bg-background shadow-[0_18px_60px_rgba(18,38,45,0.10)]">
          <CardHeader className="space-y-5 border-b bg-background pb-5">
            <div className="flex items-center justify-between gap-3">
              <SelfxLogo />
              <Badge variant="secondary" className="h-7 gap-1.5 px-3">
                <ShieldCheckIcon className="size-3.5" />
                {copy.secureSession}
              </Badge>
            </div>
            <div>
              <CardTitle className="text-3xl">{copy.title}</CardTitle>
              <CardDescription className="mt-2 text-base">
                {state.status === "INVALID"
                  ? copy.invalidDescription
                  : copy.readyDescription}
              </CardDescription>
            </div>
            {isActiveSession ? (
              <ProgressStrip copy={copy} status={state.status} />
            ) : null}
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            {state.status === "INVALID" ? (
              <InvalidLink copy={copy} />
            ) : state.status === "LOADING" ? (
              <StatePanel title={copy.preparing} />
            ) : state.status === "ERROR" ? (
              <StatePanel title={copy.unavailableTitle} body={state.message} />
            ) : (
              <>
                <ProductSummary
                  copy={copy}
                  label={productLabel ?? copy.productFallback}
                  imageUrl={session?.product.imageUrl}
                />

                <label className="flex items-start gap-3 rounded-lg border border-border/80 bg-[#edf5f5] px-4 py-3 text-sm leading-relaxed">
                  <input
                    type="checkbox"
                    checked={consented}
                    onChange={(event) => setConsented(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    {copy.consent}
                  </span>
                </label>

                <input
                  ref={cameraInput}
                  className="hidden"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="user"
                  onChange={(event) => {
                    void selectPersonImage(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
                <input
                  ref={galleryInput}
                  className="hidden"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    void selectPersonImage(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    disabled={!consented || busy || state.status === "RUNNING"}
                    onClick={() => cameraInput.current?.click()}
                  >
                    <CameraIcon data-icon="inline-start" />
                    {copy.takePhoto}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!consented || busy || state.status === "RUNNING"}
                    onClick={() => galleryInput.current?.click()}
                  >
                    <UploadIcon data-icon="inline-start" />
                    {copy.uploadPhoto}
                  </Button>
                </div>

                {state.status === "PHOTO_READY" ? (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={busy}
                    onClick={() => void startTryOn()}
                  >
                    <SparklesIcon data-icon="inline-start" />
                    {busy ? copy.starting : copy.startTryOn}
                  </Button>
                ) : null}

                {state.status === "RUNNING" ? (
                  <StatePanel title={copy.creatingTryOn} active />
                ) : null}

                {message ? (
                  <div className="rounded-lg border border-border/80 bg-[#fff7ed] px-4 py-3 text-sm">
                    {message}
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <ResultPanel
          copy={copy}
          downloading={downloading}
          onDownload={() => void downloadResult()}
          productImageUrl={session?.product.imageUrl}
          productLabel={productLabel ?? copy.productFallback}
          state={state}
        />
      </div>
    </main>
  );
}

function ProgressStrip({
  copy,
  status,
}: {
  copy: ShopifyTryOnCopy;
  status: Exclude<PageState["status"], "INVALID" | "LOADING" | "ERROR">;
}) {
  const steps = [
    { label: copy.productStep, complete: true, active: status === "READY" },
    {
      label: copy.photoStep,
      complete:
        status === "PHOTO_READY" ||
        status === "RUNNING" ||
        status === "COMPLETED",
      active: status === "PHOTO_READY",
    },
    {
      label: copy.resultStep,
      complete: status === "COMPLETED",
      active: status === "RUNNING" || status === "COMPLETED",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {steps.map((step) => (
        <div
          key={step.label}
          className={[
            "flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold",
            step.complete
              ? "border-[#ff6b1a] bg-[#fff1e8] text-[#8f350d]"
              : step.active
                ? "border-[#7a9ca5] bg-[#edf5f5] text-[#284852]"
                : "border-border bg-muted text-muted-foreground",
          ].join(" ")}
        >
          {step.complete ? <CheckCircle2Icon className="size-3.5" /> : null}
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
}

function ResultPanel({
  copy,
  downloading,
  onDownload,
  productImageUrl,
  productLabel,
  state,
}: {
  copy: ShopifyTryOnCopy;
  downloading: boolean;
  onDownload: () => void;
  productImageUrl?: string;
  productLabel: string;
  state: PageState;
}) {
  const personImageUrl =
    state.status === "PHOTO_READY" ||
    state.status === "RUNNING" ||
    state.status === "COMPLETED"
      ? state.previewUrl
      : undefined;
  const resultImageUrl =
    state.status === "COMPLETED" ? state.run.result?.readUrl : undefined;
  const isRunning = state.status === "RUNNING";

  return (
    <div className="grid w-full items-start gap-5 lg:grid-cols-[minmax(0,1fr)_25rem]">
      <Card className="w-full overflow-hidden border-border/70 bg-background shadow-[0_22px_70px_rgba(18,38,45,0.12)]">
        <CardHeader className="border-b bg-[#fbfdfd] pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <UploadIcon className="size-5 text-primary" />
                {copy.inputsTitle}
              </CardTitle>
              <CardDescription>
                {copy.inputsDescription}
              </CardDescription>
            </div>
            <Badge variant="secondary" className="h-7 px-3">
              {personImageUrl ? copy.inputsReady : copy.photoNeeded}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="rounded-lg border border-border/80 bg-[#f8fbfb] p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-[#fff1e8] text-[#ff6b1a]">
                <SparklesIcon className="size-5" />
              </span>
              <div>
                <div className="font-semibold">{copy.reviewInputsTitle}</div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {copy.reviewInputsBody}
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <VisualTile
              copy={copy}
              title={copy.productTitle}
              label={productLabel}
              imageUrl={productImageUrl}
              emptyLabel={copy.productImageUnavailable}
              state={productImageUrl ? "ready" : "empty"}
            />
            <VisualTile
              copy={copy}
              title={copy.yourPhotoTitle}
              label={
                personImageUrl
                  ? copy.uploadedImage
                  : copy.waitingForImage
              }
              imageUrl={personImageUrl}
              emptyLabel={copy.uploadedPhotoWillAppear}
              state={personImageUrl ? "ready" : "empty"}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="w-full overflow-hidden border-border/70 bg-background shadow-[0_22px_70px_rgba(18,38,45,0.12)] lg:sticky lg:top-6">
        <CardHeader className="border-b bg-[#fbfdfd] pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <SparklesIcon className="size-5 text-primary" />
                {copy.resultTitle}
              </CardTitle>
              <CardDescription>
                {state.status === "COMPLETED"
                  ? copy.resultReadyDescription
                  : copy.resultPendingDescription}
              </CardDescription>
            </div>
            <Badge
              variant={state.status === "COMPLETED" ? "default" : "secondary"}
              className="h-7 px-3"
            >
              {statusLabel(state, copy)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <VisualTile
            copy={copy}
            title={copy.generatedImageTitle}
            label={
              resultImageUrl
                ? copy.selfxResult
                : isRunning
                  ? copy.generatingTryOn
                  : copy.noResultYet
            }
            imageUrl={resultImageUrl}
            emptyLabel={
              isRunning
                ? copy.creatingVirtualTryOn
                : copy.addPhotoThenStart
            }
            featured
            state={resultImageUrl ? "ready" : isRunning ? "active" : "empty"}
          />
        {state.status === "COMPLETED" ? (
          <Button
            className="w-full"
            disabled={downloading}
            onClick={onDownload}
            size="lg"
            type="button"
          >
            <DownloadIcon data-icon="inline-start" />
            {downloading ? copy.preparingDownload : copy.download}
          </Button>
        ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function VisualTile({
  copy,
  emptyLabel,
  featured = false,
  imageUrl,
  label,
  state,
  title,
}: {
  copy: ShopifyTryOnCopy;
  emptyLabel: string;
  featured?: boolean;
  imageUrl?: string;
  label: string;
  state: "active" | "empty" | "ready";
  title: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-[#edf3f4]">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border/70 bg-background px-3 py-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
            {title}
          </div>
          <div className="truncate text-sm font-semibold">{label}</div>
        </div>
        <TileBadge copy={copy} state={state} />
      </div>
      <div
        className={[
          "relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-[#e7eff1]",
          featured ? "min-h-[430px] lg:min-h-[520px]" : "min-h-[360px]",
        ].join(" ")}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex max-w-[220px] flex-col items-center gap-3 px-5 text-center text-sm text-muted-foreground">
            {state === "active" ? (
              <LoaderCircleIcon className="size-7 animate-spin text-[#ff6b1a]" />
            ) : (
              <ImageIcon className="size-7 text-[#7a9ca5]" />
            )}
            <span>{emptyLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TileBadge({
  copy,
  state,
}: {
  copy: ShopifyTryOnCopy;
  state: "active" | "empty" | "ready";
}) {
  if (state === "ready") {
    return (
      <Badge variant="secondary" className="gap-1 bg-[#fff1e8] text-[#8f350d]">
        <CheckCircle2Icon className="size-3" />
        {copy.ready}
      </Badge>
    );
  }
  if (state === "active") {
    return (
      <Badge variant="secondary" className="gap-1">
        <LoaderCircleIcon className="size-3 animate-spin" />
        {copy.working}
      </Badge>
    );
  }
  return <Badge variant="outline">{copy.pending}</Badge>;
}

function ProductSummary({
  copy,
  label,
  imageUrl,
}: {
  copy: ShopifyTryOnCopy;
  label: string;
  imageUrl?: string;
}) {
  return (
    <div className="grid grid-cols-[78px_1fr] gap-4 rounded-lg border border-border/80 bg-[#edf5f5] p-3">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-background">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-xs font-semibold uppercase text-muted-foreground">
            {copy.productTitle}
          </span>
        )}
      </div>
      <div className="min-w-0 self-center">
        <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
          {copy.productTitle}
        </div>
        <div className="mt-1 break-words text-sm font-medium">{label}</div>
      </div>
    </div>
  );
}

function InvalidLink({ copy }: { copy: ShopifyTryOnCopy }) {
  return (
    <div className="rounded-lg border bg-muted px-4 py-5">
      <div className="font-semibold">{copy.invalidLinkTitle}</div>
      <p className="mt-1 text-sm text-muted-foreground">
        {copy.invalidLinkBody}
      </p>
    </div>
  );
}

function StatePanel({
  active = false,
  title,
  body,
}: {
  active?: boolean;
  title: string;
  body?: string;
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-[#edf5f5] px-4 py-5">
      <div className="flex items-center gap-2 font-semibold">
        {active ? (
          <LoaderCircleIcon className="size-4 animate-spin text-[#ff6b1a]" />
        ) : null}
        {title}
      </div>
      {body ? (
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      ) : null}
    </div>
  );
}

function sessionFrom(state: PageState): ShopifyTryOnSession | null {
  return "session" in state ? (state.session ?? null) : null;
}

function validSessionToken(sessionToken: string | null): sessionToken is string {
  return Boolean(sessionToken && /^[A-Za-z0-9_-]{43}$/.test(sessionToken));
}

function localeFor(value: string | undefined): ShopifyTryOnLocale {
  const clean = value?.trim().toLowerCase().split("-")[0];
  return clean &&
    Object.prototype.hasOwnProperty.call(shopifyTryOnCopies, clean)
    ? (clean as ShopifyTryOnLocale)
    : "en";
}

function statusLabel(state: PageState, copy: ShopifyTryOnCopy): string {
  if (state.status === "LOADING") {
    return copy.statusPreparing;
  }
  if (state.status === "READY") {
    return copy.statusProductReady;
  }
  if (state.status === "PHOTO_READY") {
    return copy.statusPhotoReady;
  }
  if (state.status === "RUNNING") {
    return copy.statusGenerating;
  }
  if (state.status === "COMPLETED") {
    return copy.statusComplete;
  }
  return copy.statusUnavailable;
}

function downloadFilename(run: ShopifyTryOnRun): string {
  const extension =
    run.result?.contentType === "image/png"
      ? "png"
      : run.result?.contentType === "image/webp"
        ? "webp"
        : "jpg";
  return `selfx-try-on-${run.id}.${extension}`;
}

function messageFor(error: unknown, copy: ShopifyTryOnCopy): string {
  if (error instanceof SafeApiError) {
    if (error.code === "SELFX_CREDITS_EXHAUSTED") {
      return copy.temporarilyUnavailable;
    }
    if (error.code === "SHOPIFY_STOREFRONT_TRYON_PRODUCT_NOT_ENABLED") {
      return copy.productNotEnabled;
    }
    if (error.code === "SHOPIFY_STOREFRONT_TRYON_PERSON_REQUIRED") {
      return copy.personRequired;
    }
    if (error.code === "OBJECT_STORAGE_NOT_CONFIGURED") {
      return copy.uploadsNotConfigured;
    }
    return error.message;
  }
  return copy.genericFailure;
}

function runFailureMessage(
  run: ShopifyTryOnRun,
  copy: ShopifyTryOnCopy,
): string {
  if (run.errorCode === "SELFX_CREDITS_EXHAUSTED") {
    return copy.temporarilyUnavailable;
  }
  return run.errorMessage ?? copy.runFailed;
}
