"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { toDataURL } from "qrcode";
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckCircle2Icon,
  ClockIcon,
  GemIcon,
  HistoryIcon,
  MonitorSmartphoneIcon,
  QrCodeIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  ShirtIcon,
  XCircleIcon,
} from "lucide-react";

import { Badge, Button, SelfxLogo } from "@selfx/ui";
import type {
  SelfxJewelleryPersonSemanticEvidence,
  SelfxJewelleryType,
} from "@selfx/shared";

import { SafeApiError } from "@/lib/api";
import {
  createJewelleryPersonAnalyzer,
  type JewelleryPersonAnalyzer,
} from "@/lib/jewellery-analysis/jewellery-person-analyzer";
import type { KioskConfiguration, KioskDevice } from "@/lib/kiosks";
import {
  cancelKioskCustomerUploadSession,
  completeKioskTryOnSession,
  createKioskCustomerUploadSession,
  createKioskPairingSession,
  createKioskTryOnShare,
  createKioskTryOnRun,
  createKioskTryOnSession,
  exchangeKioskProvisioningGrant,
  getCurrentKioskConfiguration,
  getCurrentKioskDevice,
  getKioskCustomerUploadSession,
  getKioskJewelleryCaptureRequirements,
  getKioskTryOnRun,
  getKioskPairingStatus,
  isKioskAccessTokenExpiredError,
  listKioskCatalogProducts,
  refreshKioskDeviceSession,
  sendKioskHeartbeat,
  setKioskTryOnSessionPersonFromCustomerUpload,
  setKioskTryOnSessionPerson,
  type KioskCatalogProduct,
  type KioskCustomerUploadPhoto,
  type KioskCustomerUploadSession,
  type KioskDeviceAuth,
  type KioskJewelleryCaptureRequirements,
  type KioskPairingSession,
  type KioskTryOnAsset,
  type KioskTryOnRun,
  type KioskTryOnShare,
  type KioskTryOnSession,
} from "@/lib/web-kiosk-device";
import { WebKioskInstallBanner } from "@/components/web-kiosk-install-banner";

type KioskScreen =
  | "start"
  | "mobile-upload"
  | "consent"
  | "camera"
  | "review"
  | "ready"
  | "catalog"
  | "generating"
  | "result";
type CameraStatus = "idle" | "starting" | "ready" | "capturing" | "error";
type DeviceState = "checking" | "unpaired" | "pairing" | "paired" | "blocked";
type ConfigurationStatus = "idle" | "loading" | "ready" | "error";
type PersonUploadStatus = "idle" | "checking" | "saving" | "ready" | "error";
type CatalogStatus = "idle" | "loading" | "ready" | "empty" | "error";
type ProductVertical = KioskCatalogProduct["productVertical"];
type JewelleryRequirementsStatus = "idle" | "loading" | "ready" | "error";
type PairingState =
  | "idle"
  | "creating"
  | "waiting"
  | "exchanging"
  | "expired"
  | "error";

type CapturedPhoto = {
  url: string;
  blob: Blob;
  capturedAt: string;
  width: number;
  height: number;
};

type PersonPhotoPreview = {
  url: string;
  width: number;
  height: number;
};

type CaptureGuidance = Pick<
  KioskJewelleryCaptureRequirements,
  | "guide"
  | "jewelleryType"
  | "title"
  | "instruction"
  | "checklist"
  | "requiredChecks"
>;

type CompletedLook = {
  runId: string;
  productName: string;
  resultImage: string;
  completedAt: string;
};

type KioskCapabilityAvailability = {
  loading: boolean;
  garmentTryOnEnabled: boolean;
  jewelleryTryOnEnabled: boolean;
  mobileUploadEnabled: boolean;
};

const cameraConstraints: MediaStreamConstraints = {
  audio: false,
  video: {
    width: { ideal: 1440 },
    height: { ideal: 1920 },
    facingMode: { ideal: "user" },
  },
};

const deviceSessionStorageKey = "selfx.webKiosk.deviceSession.v1";
const installationIdStorageKey = "selfx.webKiosk.installationId.v1";
const heartbeatIntervalMs = 60_000;
const defaultCustomerSessionIdleTimeoutMs = 5 * 60_000;
const customerSessionIdleCheckMs = 15_000;

function getCameraErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Camera permission is needed to take your photo. Please allow camera access and try again.";
    }

    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      return "No camera is available on this device. Please check the connected camera and try again.";
    }

    if (error.name === "NotReadableError") {
      return "The camera is already in use. Please close other camera apps and try again.";
    }
  }

  return "The camera could not start. Please check the device and try again.";
}

export function WebKioskClient() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const jewelleryPersonAnalyzerRef = useRef<JewelleryPersonAnalyzer | null>(null);
  const hydratedRef = useRef(false);
  const sessionExpiringRef = useRef(false);
  const lastActivityAtRef = useRef(Date.now());
  const [screen, setScreen] = useState<KioskScreen>("start");
  const [deviceState, setDeviceState] = useState<DeviceState>("checking");
  const [deviceSession, setDeviceSession] = useState<KioskDeviceAuth | null>(null);
  const [kioskConfiguration, setKioskConfiguration] =
    useState<KioskConfiguration | null>(null);
  const [configurationStatus, setConfigurationStatus] =
    useState<ConfigurationStatus>("idle");
  const [configurationError, setConfigurationError] = useState<string | null>(
    null,
  );
  const [pairingSession, setPairingSession] =
    useState<KioskPairingSession | null>(null);
  const [pairingState, setPairingState] = useState<PairingState>("idle");
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<CapturedPhoto | null>(null);
  const [personUploadStatus, setPersonUploadStatus] =
    useState<PersonUploadStatus>("idle");
  const [personUploadError, setPersonUploadError] = useState<string | null>(null);
  const [tryOnSession, setTryOnSession] = useState<KioskTryOnSession | null>(null);
  const [personAsset, setPersonAsset] = useState<KioskTryOnAsset | null>(null);
  const [mobileUploadSession, setMobileUploadSession] =
    useState<KioskCustomerUploadSession | null>(null);
  const [mobileUploadStatus, setMobileUploadStatus] =
    useState<"idle" | "creating" | "waiting" | "ready" | "saving" | "error">(
      "idle",
    );
  const [mobileUploadError, setMobileUploadError] = useState<string | null>(null);
  const [mobileUploadPhoto, setMobileUploadPhoto] =
    useState<KioskCustomerUploadPhoto | null>(null);
  const [activeVertical, setActiveVertical] = useState<ProductVertical>("GARMENT");
  const [catalogProducts, setCatalogProducts] = useState<KioskCatalogProduct[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("idle");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] =
    useState<KioskCatalogProduct | null>(null);
  const [jewelleryRequirements, setJewelleryRequirements] =
    useState<KioskJewelleryCaptureRequirements | null>(null);
  const [jewelleryRequirementsStatus, setJewelleryRequirementsStatus] =
    useState<JewelleryRequirementsStatus>("idle");
  const [jewelleryRequirementsError, setJewelleryRequirementsError] =
    useState<string | null>(null);
  const [tryOnRun, setTryOnRun] = useState<KioskTryOnRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] =
    useState<"idle" | "creating" | "ready" | "error">("idle");
  const [share, setShare] = useState<KioskTryOnShare | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [endSessionConfirmOpen, setEndSessionConfirmOpen] = useState(false);
  const [endSessionBusy, setEndSessionBusy] = useState(false);
  const [completedLooks, setCompletedLooks] = useState<CompletedLook[]>([]);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const kioskCapabilities = getKioskCapabilityAvailability(
    kioskConfiguration,
    configurationStatus,
  );
  const customerSessionIdleTimeoutMs =
    getCustomerSessionIdleTimeoutMs(kioskConfiguration);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraStatus((status) => (status === "capturing" ? status : "idle"));
  }, []);

  const clearCapturedPhoto = useCallback(() => {
    setCapturedPhoto((photo) => {
      if (photo) {
        URL.revokeObjectURL(photo.url);
      }

      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      clearCapturedPhoto();
      jewelleryPersonAnalyzerRef.current?.dispose();
    };
  }, [clearCapturedPhoto, stopCamera]);

  useEffect(() => {
    function markActivity() {
      lastActivityAtRef.current = Date.now();
    }

    window.addEventListener("pointerdown", markActivity, { passive: true });
    window.addEventListener("touchstart", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);

    return () => {
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("touchstart", markActivity);
      window.removeEventListener("keydown", markActivity);
    };
  }, []);

  useEffect(() => {
    if (hydratedRef.current) {
      return;
    }

    hydratedRef.current = true;
    void hydrateDeviceSession();
  }, []);

  useEffect(() => {
    if (deviceState !== "unpaired" || pairingState !== "idle") {
      return;
    }

    void beginPairingSession();
  }, [deviceState, pairingState]);

  useEffect(() => {
    if (!pairingSession || pairingState !== "waiting") {
      return;
    }

    const currentPairingSession = pairingSession;
    let cancelled = false;
    const pollDelayMs =
      Math.max(currentPairingSession.pollIntervalSeconds, 2) * 1000;

    async function pollPairingStatus() {
      try {
        const status = await getKioskPairingStatus(currentPairingSession);

        if (cancelled) {
          return;
        }

        if (status.status === "EXPIRED") {
          setPairingState("expired");
          return;
        }

        if (status.status === "PAIRED" && status.provisioningGrant) {
          setPairingState("exchanging");
          const auth = await exchangeKioskProvisioningGrant(
            currentPairingSession,
            status.provisioningGrant,
          );
          if (!cancelled) {
            applyDeviceAuth(auth);
            setPairingSession(null);
            setPairingState("idle");
            setScreen("start");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setDeviceError(getSafeMessage(error, "Pairing status could not be checked."));
          setPairingState("error");
        }
      }
    }

    const intervalId = window.setInterval(
      () => void pollPairingStatus(),
      pollDelayMs,
    );
    void pollPairingStatus();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [pairingSession, pairingState]);

  useEffect(() => {
    if (!deviceSession || deviceState !== "paired") {
      return;
    }

    const currentDeviceSession = deviceSession;
    let cancelled = false;

    async function heartbeat() {
      try {
        const device = await sendKioskHeartbeat(currentDeviceSession.accessToken);
        if (!cancelled) {
          setDeviceSession((current) =>
            current ? { ...current, device } : current,
          );
        }
      } catch (error) {
        if (isKioskAccessTokenExpiredError(error)) {
          try {
            const refreshed = await refreshKioskDeviceSession(
              currentDeviceSession.refreshToken,
            );
            if (!cancelled) {
              applyDeviceAuth(refreshed);
            }
            return;
          } catch (refreshError) {
            if (!cancelled) {
              await handleDeviceAuthFailure(refreshError);
            }
            return;
          }
        }

        if (!cancelled) {
          await handleDeviceAuthFailure(error);
        }
      }
    }

    void heartbeat();
    const intervalId = window.setInterval(
      () => void heartbeat(),
      heartbeatIntervalMs,
    );

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [deviceSession?.accessToken, deviceSession?.refreshToken, deviceState]);

  useEffect(() => {
    if (!deviceSession || deviceState !== "paired") {
      setKioskConfiguration(null);
      setConfigurationStatus("idle");
      setConfigurationError(null);
      return;
    }

    void loadKioskConfiguration();
  }, [
    deviceSession?.accessToken,
    deviceSession?.device.latestConfigurationVersion,
    deviceState,
  ]);

  useEffect(() => {
    if (deviceState !== "paired" || screen === "start") {
      return;
    }

    const intervalId = window.setInterval(() => {
      const idleForMs = Date.now() - lastActivityAtRef.current;
      if (idleForMs >= customerSessionIdleTimeoutMs) {
        void expireCustomerSession();
      }
    }, customerSessionIdleCheckMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    customerSessionIdleTimeoutMs,
    deviceState,
    screen,
    tryOnSession?.sessionId,
    tryOnSession?.status,
  ]);

  useEffect(() => {
    if (screen !== "catalog" || catalogStatus !== "idle") {
      return;
    }

    void loadCatalog();
  }, [activeVertical, catalogStatus, screen]);

  useEffect(() => {
    if (
      screen !== "mobile-upload" ||
      !mobileUploadSession ||
      mobileUploadStatus !== "waiting"
    ) {
      return;
    }

    const currentMobileUploadSession = mobileUploadSession;
    let cancelled = false;
    const pollDelayMs =
      Math.max(currentMobileUploadSession.pollIntervalSeconds ?? 2, 2) * 1000;

    async function pollMobileUpload() {
      try {
        const updated = await withDeviceAccess((accessToken) =>
          getKioskCustomerUploadSession(
            accessToken,
            currentMobileUploadSession.sessionId,
          ),
        );
        if (cancelled) {
          return;
        }
        setMobileUploadSession(updated);

        if (updated.status === "READY" && updated.photo) {
          setMobileUploadPhoto(updated.photo);
          setMobileUploadStatus("ready");
          return;
        }

        if (updated.status === "REJECTED") {
          setMobileUploadStatus("error");
          setMobileUploadError("That photo could not be used. Please scan again and upload a clearer photo.");
          return;
        }

        if (
          updated.status === "EXPIRED" ||
          updated.status === "CANCELLED" ||
          updated.status === "CONSUMED"
        ) {
          setMobileUploadStatus("error");
          setMobileUploadError("This upload session ended. Start a new mobile upload.");
        }
      } catch (error) {
        if (!cancelled) {
          setMobileUploadStatus("error");
          setMobileUploadError(
            getSafeMessage(error, "Mobile upload status could not be checked."),
          );
        }
      }
    }

    const intervalId = window.setInterval(
      () => void pollMobileUpload(),
      pollDelayMs,
    );
    void pollMobileUpload();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [mobileUploadSession, mobileUploadStatus, screen]);

  useEffect(() => {
    if (
      screen !== "generating" ||
      !tryOnRun ||
      (tryOnRun.status !== "QUEUED" && tryOnRun.status !== "PROCESSING")
    ) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const updated = await withDeviceAccess((accessToken) =>
          getKioskTryOnRun(accessToken, tryOnRun.id),
        );
        if (cancelled) {
          return;
        }
        setTryOnRun(updated);
        if (updated.status === "COMPLETED" || updated.status === "FAILED") {
          if (selectedProduct) {
            rememberCompletedLook(updated, selectedProduct);
          }
          setScreen("result");
        }
      } catch (error) {
        if (!cancelled) {
          setRunError(getSafeMessage(error, "Try-On status could not be checked."));
          setScreen("result");
        }
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [screen, tryOnRun]);

  useEffect(() => {
    let active = true;

    async function openCamera() {
      if (screen !== "camera" || !consented) {
        stopCamera();
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus("error");
        setCameraError("This browser does not support camera capture.");
        return;
      }

      setCameraStatus("starting");
      setCameraError(null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints);

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (active) {
          setCameraStatus("ready");
        }
      } catch (error) {
        if (active) {
          setCameraStatus("error");
          setCameraError(getCameraErrorMessage(error));
        }
      }
    }

    void openCamera();

    return () => {
      active = false;
      if (screen === "camera") {
        stopCamera();
      }
    };
  }, [consented, screen, stopCamera]);

  async function capturePhoto() {
    const video = videoRef.current;

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraStatus("error");
      setCameraError("The camera preview is not ready yet. Please try again.");
      return;
    }

    setCameraStatus("capturing");

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      setCameraStatus("error");
      setCameraError("The photo could not be prepared. Please try again.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!blob) {
      setCameraStatus("error");
      setCameraError("The photo could not be captured. Please try again.");
      return;
    }

    clearCapturedPhoto();
    setCapturedPhoto({
      url: URL.createObjectURL(blob),
      blob,
      capturedAt: new Date().toISOString(),
      width: canvas.width,
      height: canvas.height,
    });
    stopCamera();
    setScreen("review");
  }

  function startGarmentCapture() {
    lastActivityAtRef.current = Date.now();
    if (!kioskCapabilities.garmentTryOnEnabled) {
      setSessionNotice("Garment Try-On is not enabled for this kiosk.");
      return;
    }

    setSessionNotice(null);
    setActiveVertical("GARMENT");
    setConsented(false);
    setCameraError(null);
    clearTryOnSessionState();
    clearCapturedPhoto();
    setScreen("consent");
  }

  async function startMobileUpload() {
    lastActivityAtRef.current = Date.now();
    if (!kioskCapabilities.mobileUploadEnabled) {
      setSessionNotice("Mobile upload is not available for this kiosk.");
      return;
    }

    setSessionNotice(null);
    stopCamera();
    setActiveVertical("GARMENT");
    setConsented(false);
    setCameraError(null);
    clearCapturedPhoto();
    clearTryOnSessionState();
    setMobileUploadStatus("creating");
    setMobileUploadError(null);
    setMobileUploadSession(null);
    setMobileUploadPhoto(null);
    setScreen("mobile-upload");

    try {
      const session = await withDeviceAccess((accessToken) =>
        createKioskCustomerUploadSession(accessToken, "MODEL"),
      );
      setMobileUploadSession(session);
      setMobileUploadPhoto(session.photo ?? null);
      setMobileUploadStatus(
        session.status === "READY" && session.photo ? "ready" : "waiting",
      );
    } catch (error) {
      setMobileUploadStatus("error");
      setMobileUploadError(
        getSafeMessage(error, "Mobile upload session could not be created."),
      );
    }
  }

  async function cancelMobileUpload() {
    const current = mobileUploadSession;

    try {
      if (current && current.status !== "READY") {
        await withDeviceAccess((accessToken) =>
          cancelKioskCustomerUploadSession(accessToken, current.sessionId),
        );
      }
    } catch {
      // Local reset still clears the customer-facing kiosk state.
    } finally {
      returnToStart();
    }
  }

  function startJewellerySelection() {
    lastActivityAtRef.current = Date.now();
    if (!kioskCapabilities.jewelleryTryOnEnabled) {
      setSessionNotice("Jewellery Try-On is not enabled for this kiosk.");
      return;
    }

    setSessionNotice(null);
    stopCamera();
    setActiveVertical("JEWELLERY");
    setConsented(false);
    setCameraError(null);
    clearCapturedPhoto();
    clearTryOnSessionState();
    setCatalogStatus("idle");
    setCatalogError(null);
    setCatalogProducts([]);
    clearJewelleryRequirements();
    setScreen("catalog");
  }

  function returnToStart() {
    stopCamera();
    setSessionNotice(null);
    setEndSessionConfirmOpen(false);
    setEndSessionBusy(false);
    setConsented(false);
    setCameraError(null);
    clearCapturedPhoto();
    clearTryOnSessionState();
    clearMobileUploadState();
    setScreen("start");
  }

  function retakePhoto() {
    setSessionNotice(null);
    clearCapturedPhoto();
    clearMobileUploadState();
    clearTryOnSessionState({
      preserveSelectedProduct: activeVertical === "JEWELLERY",
      preserveJewelleryRequirements: activeVertical === "JEWELLERY",
    });
    setCameraError(null);
    setScreen("camera");
  }

  async function endTryOnSession() {
    const currentSession = tryOnSession;

    setEndSessionBusy(true);
    try {
      if (currentSession?.status === "ACTIVE") {
        await withDeviceAccess((accessToken) =>
          completeKioskTryOnSession(accessToken, currentSession.sessionId),
        );
      }
    } finally {
      returnToStart();
    }
  }

  function requestEndTryOnSession() {
    setEndSessionConfirmOpen(true);
  }

  async function expireCustomerSession() {
    if (sessionExpiringRef.current) {
      return;
    }

    sessionExpiringRef.current = true;
    const currentSession = tryOnSession;

    try {
      if (currentSession?.status === "ACTIVE") {
        await withDeviceAccess((accessToken) =>
          completeKioskTryOnSession(
            accessToken,
            currentSession.sessionId,
            "IDLE_TIMEOUT",
          ),
        );
      }
    } catch {
      // The kiosk still clears local sensitive state when cleanup cannot reach
      // the server; the next heartbeat/session call will re-sync device state.
    } finally {
      stopCamera();
      setConsented(false);
      setCameraError(null);
      clearCapturedPhoto();
      clearTryOnSessionState();
      setSessionNotice("The last session ended after a few minutes of inactivity.");
      setScreen("start");
      sessionExpiringRef.current = false;
      lastActivityAtRef.current = Date.now();
    }
  }

  async function loadCatalog() {
    setCatalogStatus("loading");
    setCatalogError(null);

    try {
      const response = await withDeviceAccess((accessToken) =>
        listKioskCatalogProducts(accessToken, {
          productVertical: activeVertical,
          pageSize: 12,
        }),
      );
      setCatalogProducts(response.data);
      setCatalogStatus(response.data.length > 0 ? "ready" : "empty");
    } catch (error) {
      setCatalogStatus("error");
      setCatalogError(getSafeMessage(error, "Catalog could not be loaded."));
    }
  }

  async function startTryOnRun(
    product: KioskCatalogProduct,
    input: {
      session?: KioskTryOnSession;
      asset?: KioskTryOnAsset;
    } = {},
  ) {
    const session = input.session ?? tryOnSession;
    const asset = input.asset ?? personAsset;

    if (!session?.sessionId || !asset?.assetId) {
      setRunError(
        product.productVertical === "JEWELLERY"
          ? "Take and save a photo before trying on this jewellery."
          : "Take and save a photo before choosing a garment.",
      );
      setScreen("result");
      return;
    }

    setSelectedProduct(product);
    setTryOnRun(null);
    setRunError(null);
    setShareStatus("idle");
    setShare(null);
    setShareError(null);
    setScreen("generating");

    try {
      const run = await withDeviceAccess((accessToken) =>
        createKioskTryOnRun(accessToken, {
          sessionId: session.sessionId,
          personAssetId: asset.assetId,
          productId: product.id,
          clientRequestId: createClientRequestId(),
          tryOnVertical: product.productVertical,
        }),
      );
      setTryOnRun(run);
      if (run.status === "COMPLETED" || run.status === "FAILED") {
        rememberCompletedLook(run, product);
        setScreen("result");
      }
    } catch (error) {
      setRunError(getSafeMessage(error, "Try-On could not be started."));
      setScreen("result");
    }
  }

  async function acceptPhoto() {
    if (!capturedPhoto) {
      setPersonUploadStatus("error");
      setPersonUploadError("Take a photo before continuing.");
      return;
    }

    setPersonUploadStatus(activeVertical === "JEWELLERY" ? "checking" : "saving");
    setPersonUploadError(null);

    try {
      if (activeVertical === "JEWELLERY" && selectedProduct) {
        const preflightMessage = await preflightJewelleryPersonPhoto(
          capturedPhoto.blob,
          selectedProduct,
        );

        if (preflightMessage) {
          setPersonUploadStatus("error");
          setPersonUploadError(preflightMessage);
          return;
        }
      }

      setPersonUploadStatus("saving");
      const session =
        tryOnSession?.status === "ACTIVE"
          ? tryOnSession
          : await withDeviceAccess((accessToken) =>
              createKioskTryOnSession(accessToken),
            );
      const asset = await withDeviceAccess((accessToken) =>
        setKioskTryOnSessionPerson(
          accessToken,
          session.sessionId,
          capturedPhoto.blob,
        ),
      );

      setTryOnSession({
        ...session,
        currentPersonAssetId: asset.assetId,
      });
      setPersonAsset(asset);
      setPersonUploadStatus("ready");

      if (activeVertical === "JEWELLERY" && selectedProduct) {
        await startTryOnRun(selectedProduct, {
          session: {
            ...session,
            currentPersonAssetId: asset.assetId,
          },
          asset,
        });
        return;
      }

      setScreen("ready");
    } catch (error) {
      setPersonUploadStatus("error");
      setPersonUploadError(
        getSafeMessage(error, "Photo could not be saved to this kiosk session."),
      );
    }
  }

  async function useMobileUploadPhoto() {
    if (!mobileUploadSession || mobileUploadStatus !== "ready") {
      setMobileUploadStatus("error");
      setMobileUploadError("Upload a photo from your phone before continuing.");
      return;
    }

    setMobileUploadStatus("saving");
    setMobileUploadError(null);

    try {
      const session =
        tryOnSession?.status === "ACTIVE"
          ? tryOnSession
          : await withDeviceAccess((accessToken) =>
              createKioskTryOnSession(accessToken),
            );
      const asset = await withDeviceAccess((accessToken) =>
        setKioskTryOnSessionPersonFromCustomerUpload(
          accessToken,
          session.sessionId,
          mobileUploadSession.sessionId,
        ),
      );

      setTryOnSession({
        ...session,
        currentPersonAssetId: asset.assetId,
      });
      setPersonAsset(asset);
      setPersonUploadStatus("ready");
      setMobileUploadPhoto(mobileUploadSession.photo ?? mobileUploadPhoto);
      setScreen("ready");
    } catch (error) {
      setMobileUploadStatus("error");
      setMobileUploadError(
        getSafeMessage(error, "Uploaded photo could not be used."),
      );
    }
  }

  async function preflightJewelleryPersonPhoto(
    photoBlob: Blob,
    product: KioskCatalogProduct,
  ): Promise<string | null> {
    const jewelleryType = supportedJewelleryType(
      jewelleryRequirements?.jewelleryType ?? product.jewelleryType,
    );

    if (!jewelleryType) {
      return "This jewellery item is missing capture guidance. Please choose another item.";
    }

    jewelleryPersonAnalyzerRef.current ??= createJewelleryPersonAnalyzer();
    const file =
      photoBlob instanceof File
        ? photoBlob
        : new File([photoBlob], "selfx-jewellery-person-capture.jpg", {
            type: photoBlob.type || "image/jpeg",
          });
    const evidence = await jewelleryPersonAnalyzerRef.current.analyze(
      file,
      jewelleryType,
    );

    return jewelleryPreflightIssue(evidence, captureGuidance);
  }

  function rememberCompletedLook(
    run: KioskTryOnRun,
    product: KioskCatalogProduct,
  ) {
    const resultImage = run.resultImage;
    if (run.status !== "COMPLETED" || !resultImage) {
      return;
    }

    setCompletedLooks((looks) => {
      if (looks.some((look) => look.runId === run.id)) {
        return looks;
      }

      return [
        {
          runId: run.id,
          productName: product.name,
          resultImage,
          completedAt: run.updatedAt,
        },
        ...looks,
      ].slice(0, 6);
    });
  }

  function chooseAnotherProduct() {
    setRunError(null);
    setTryOnRun(null);
    setScreen("catalog");
  }

  function retrySelectedProduct() {
    if (!selectedProduct) {
      chooseAnotherProduct();
      return;
    }

    void startTryOnRun(selectedProduct);
  }

  async function createShareQr() {
    if (!tryOnSession?.sessionId) {
      setShareStatus("error");
      setShareError("Start a Try-On session before sharing.");
      return;
    }

    setShareStatus("creating");
    setShareError(null);

    try {
      const nextShare = await withDeviceAccess((accessToken) =>
        createKioskTryOnShare(accessToken, tryOnSession.sessionId),
      );
      setShare(nextShare);
      setShareStatus("ready");
    } catch (error) {
      setShare(null);
      setShareStatus("error");
      setShareError(
        getSafeMessage(
          error,
          "Share link could not be created. Try again in a moment.",
        ),
      );
    }
  }

  function chooseCatalogProduct(product: KioskCatalogProduct) {
    if (activeVertical === "JEWELLERY") {
      setSelectedProduct(product);
      setRunError(null);
      setTryOnRun(null);
      setPersonUploadError(null);
      setPersonUploadStatus("idle");
      setConsented(false);
      setCameraError(null);
      clearCapturedPhoto();
      void loadJewelleryRequirements(product);
      setScreen("consent");
      return;
    }

    void startTryOnRun(product);
  }

  async function loadJewelleryRequirements(product: KioskCatalogProduct) {
    setJewelleryRequirements(null);
    setJewelleryRequirementsStatus("loading");
    setJewelleryRequirementsError(null);

    try {
      const requirements = await withDeviceAccess((accessToken) =>
        getKioskJewelleryCaptureRequirements(accessToken, product.id),
      );
      setJewelleryRequirements(requirements);
      setJewelleryRequirementsStatus("ready");
    } catch (error) {
      setJewelleryRequirements(null);
      setJewelleryRequirementsStatus("error");
      setJewelleryRequirementsError(
        getSafeMessage(error, "Jewellery capture guide could not be loaded."),
      );
    }
  }

  function clearJewelleryRequirements() {
    setJewelleryRequirements(null);
    setJewelleryRequirementsStatus("idle");
    setJewelleryRequirementsError(null);
  }

  function clearMobileUploadState() {
    setMobileUploadSession(null);
    setMobileUploadStatus("idle");
    setMobileUploadError(null);
    setMobileUploadPhoto(null);
  }

  async function withDeviceAccess<T>(
    operation: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const current = deviceSession;
    if (!current) {
      throw new Error("This kiosk is not paired.");
    }

    try {
      return await operation(current.accessToken);
    } catch (error) {
      if (!isKioskAccessTokenExpiredError(error)) {
        throw error;
      }

      const refreshed = await refreshKioskDeviceSession(current.refreshToken);
      applyDeviceAuth(refreshed);
      return operation(refreshed.accessToken);
    }
  }

  async function loadKioskConfiguration() {
    if (!deviceSession || deviceState !== "paired") {
      return;
    }

    setConfigurationStatus("loading");
    setConfigurationError(null);

    try {
      const configuration = await withDeviceAccess((accessToken) =>
        getCurrentKioskConfiguration(accessToken),
      );
      setKioskConfiguration(configuration);
      setConfigurationStatus("ready");
    } catch (error) {
      setConfigurationStatus("error");
      setConfigurationError(
        getSafeMessage(error, "Kiosk settings could not be loaded."),
      );
    }
  }

  async function hydrateDeviceSession() {
    const stored = loadStoredDeviceAuth();
    if (!stored) {
      setKioskConfiguration(null);
      setConfigurationStatus("idle");
      setConfigurationError(null);
      setDeviceState("unpaired");
      return;
    }

    setDeviceState("checking");
    try {
      const device = await getCurrentKioskDevice(stored.accessToken);
      applyDeviceAuth({ ...stored, device });
    } catch (error) {
      if (isKioskAccessTokenExpiredError(error)) {
        try {
          const refreshed = await refreshKioskDeviceSession(stored.refreshToken);
          applyDeviceAuth(refreshed);
          return;
        } catch (refreshError) {
          clearStoredDeviceAuth();
          setDeviceError(getSafeMessage(refreshError, "Kiosk session expired. Pair this kiosk again."));
          setDeviceState("unpaired");
          return;
        }
      }

      await handleDeviceAuthFailure(error);
    }
  }

  async function beginPairingSession() {
    setPairingState("creating");
    setDeviceError(null);

    try {
      const session = await createKioskPairingSession({
        installationId: getOrCreateInstallationId(),
        platform: "web-pwa",
        appVersion: "web-kiosk-pwa",
      });
      setPairingSession(session);
      setPairingState("waiting");
      setDeviceState("pairing");
    } catch (error) {
      setDeviceError(getSafeMessage(error, "Pairing code could not be created."));
      setPairingState("error");
      setDeviceState("unpaired");
    }
  }

  function applyDeviceAuth(auth: KioskDeviceAuth) {
    saveDeviceAuth(auth);
    setDeviceSession(auth);
    setDeviceError(null);
    setDeviceState("paired");
  }

  async function handleDeviceAuthFailure(error: unknown) {
    if (
      error instanceof SafeApiError &&
      (error.code === "DEVICE_UNPAIRED" ||
        error.code === "DEVICE_REVOKED" ||
        error.code === "DEVICE_DELETED")
    ) {
      clearStoredDeviceAuth();
      setDeviceSession(null);
      setKioskConfiguration(null);
      setConfigurationStatus("idle");
      setConfigurationError(null);
      setDeviceError(error.message);
      setDeviceState("unpaired");
      setPairingState("idle");
      setPairingSession(null);
      return;
    }

    if (
      error instanceof SafeApiError &&
      error.code === "DEVICE_INACTIVE"
    ) {
      setKioskConfiguration(null);
      setConfigurationStatus("idle");
      setConfigurationError(null);
      setDeviceError(error.message);
      setDeviceState("blocked");
      return;
    }

    clearStoredDeviceAuth();
    setDeviceSession(null);
    setKioskConfiguration(null);
    setConfigurationStatus("idle");
    setConfigurationError(null);
    setDeviceError(getSafeMessage(error, "Kiosk session could not be verified."));
    setDeviceState("unpaired");
    setPairingState("idle");
    setPairingSession(null);
  }

  function resetPairing() {
    stopCamera();
    clearCapturedPhoto();
    clearStoredDeviceAuth();
    setDeviceSession(null);
    setKioskConfiguration(null);
    setConfigurationStatus("idle");
    setConfigurationError(null);
    setPairingSession(null);
    setPairingState("idle");
    setDeviceError(null);
    clearTryOnSessionState();
    clearMobileUploadState();
    setScreen("start");
    setDeviceState("unpaired");
  }

  function clearTryOnSessionState(
    options: {
      preserveSelectedProduct?: boolean;
      preserveJewelleryRequirements?: boolean;
    } = {},
  ) {
    setPersonUploadStatus("idle");
    setPersonUploadError(null);
    setTryOnSession(null);
    setPersonAsset(null);
    if (!options.preserveSelectedProduct) {
      setSelectedProduct(null);
    }
    if (!options.preserveJewelleryRequirements) {
      clearJewelleryRequirements();
    }
    setTryOnRun(null);
    setRunError(null);
    setShareStatus("idle");
    setShare(null);
    setShareError(null);
    setCompletedLooks([]);
  }

  const captureGuidance =
    activeVertical === "JEWELLERY"
      ? (jewelleryRequirements ?? fallbackJewelleryGuidance(selectedProduct))
      : null;
  const captureGuidanceLoading =
    activeVertical === "JEWELLERY" &&
    jewelleryRequirementsStatus === "loading";
  const personPhotoPreview = capturedPhoto
    ? {
        url: capturedPhoto.url,
        width: capturedPhoto.width,
        height: capturedPhoto.height,
      }
    : mobileUploadPhoto
      ? {
          url: mobileUploadPhoto.readUrl,
          width: mobileUploadPhoto.width,
          height: mobileUploadPhoto.height,
        }
      : null;

  if (deviceState === "checking") {
    return <KioskFrame badge="Checking device" body={<CheckingDeviceScreen />} />;
  }

  if (deviceState === "blocked") {
    return (
      <KioskFrame
        badge="Device blocked"
        body={
          <BlockedDeviceScreen
            error={deviceError}
            device={deviceSession?.device ?? null}
            onReset={resetPairing}
          />
        }
      />
    );
  }

  if (deviceState === "unpaired" || deviceState === "pairing") {
    return (
      <KioskFrame
        badge="Pair kiosk"
        body={
          <PairingScreen
            pairingSession={pairingSession}
            pairingState={pairingState}
            error={deviceError}
            onRefreshCode={() => {
              setPairingSession(null);
              void beginPairingSession();
            }}
            onRetry={() => void beginPairingSession()}
          />
        }
      />
    );
  }

  return (
    <KioskFrame
      badge={deviceSession?.device.displayName ?? "Paired kiosk"}
      body={
        <>
          {screen === "start" ? (
            <StartScreen
              device={deviceSession?.device ?? null}
              notice={sessionNotice}
              capabilities={kioskCapabilities}
              configurationStatus={configurationStatus}
              configurationError={configurationError}
              onStartMobileUpload={() => void startMobileUpload()}
              onStartGarmentCapture={startGarmentCapture}
              onStartJewellerySelection={startJewellerySelection}
              onRetryConfiguration={() => void loadKioskConfiguration()}
              onResetPairing={resetPairing}
            />
          ) : null}
          {screen === "mobile-upload" ? (
            <MobileUploadScreen
              session={mobileUploadSession}
              status={mobileUploadStatus}
              error={mobileUploadError}
              onCancel={() => void cancelMobileUpload()}
              onNewSession={() => void startMobileUpload()}
              onUsePhoto={() => void useMobileUploadPhoto()}
            />
          ) : null}
          {screen === "consent" ? (
            <ConsentScreen
              consented={consented}
              guidance={captureGuidance}
              guidanceLoading={captureGuidanceLoading}
              guidanceError={jewelleryRequirementsError}
              onConsentChange={setConsented}
              onBack={returnToStart}
              onContinue={() => setScreen("camera")}
            />
          ) : null}
          {screen === "camera" ? (
            <CameraScreen
              videoRef={videoRef}
              status={cameraStatus}
              error={cameraError}
              guidance={captureGuidance}
              onBack={() => {
                stopCamera();
                setScreen("consent");
              }}
              onCapture={capturePhoto}
              onRetry={() => {
                setCameraError(null);
                setCameraStatus("idle");
                setScreen("consent");
                window.setTimeout(() => setScreen("camera"), 0);
              }}
            />
          ) : null}
          {screen === "review" ? (
            <ReviewScreen
              photo={capturedPhoto}
              uploadStatus={personUploadStatus}
              uploadError={personUploadError}
              guidance={captureGuidance}
              activeVertical={activeVertical}
              onBack={returnToStart}
              onRetake={retakePhoto}
              onContinue={() => void acceptPhoto()}
            />
          ) : null}
          {screen === "ready" ? (
            <PhotoReadyScreen
              photo={personPhotoPreview}
              session={tryOnSession}
              asset={personAsset}
              onChooseGarment={() => {
                setCatalogStatus((status) =>
                  status === "error" ? "idle" : status,
                );
                setScreen("catalog");
              }}
              onRetake={retakePhoto}
              onStartOver={requestEndTryOnSession}
            />
          ) : null}
          {screen === "catalog" ? (
            <CatalogScreen
              products={catalogProducts}
              status={catalogStatus}
              error={catalogError}
              vertical={activeVertical}
              completedLooks={completedLooks}
              onBack={() =>
                activeVertical === "JEWELLERY"
                  ? returnToStart()
                  : setScreen("ready")
              }
              onRetry={() => {
                setCatalogStatus("idle");
                setCatalogError(null);
              }}
              onSelect={chooseCatalogProduct}
            />
          ) : null}
          {screen === "generating" ? (
            <GeneratingScreen product={selectedProduct} run={tryOnRun} />
          ) : null}
          {screen === "result" ? (
            <ResultScreen
              photo={personPhotoPreview}
              product={selectedProduct}
              run={tryOnRun}
              error={runError}
              completedLooks={completedLooks}
              share={share}
              shareStatus={shareStatus}
              shareError={shareError}
              onCreateShare={() => void createShareQr()}
              onRetry={retrySelectedProduct}
              onTryAnother={chooseAnotherProduct}
              onRetake={retakePhoto}
              onStartOver={requestEndTryOnSession}
            />
          ) : null}
          {endSessionConfirmOpen ? (
            <EndSessionConfirmDialog
              busy={endSessionBusy}
              onCancel={() => setEndSessionConfirmOpen(false)}
              onConfirm={() => void endTryOnSession()}
            />
          ) : null}
        </>
      }
      showInstallBanner={screen === "start"}
    />
  );
}

function KioskFrame({
  badge,
  body,
  showInstallBanner = false,
}: {
  badge: string;
  body: ReactNode;
  showInstallBanner?: boolean;
}) {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-stone-950 text-white">
      <video
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        poster="/brand/selfx-logo.png"
      >
        <source src="/kiosk/default-start-screen.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(20_17_15/0.9),rgb(31_41_55/0.58),rgb(3_7_18/0.28))]" />

      <section className="relative z-10 flex min-h-dvh flex-col px-5 py-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between gap-4">
          <div className="rounded-lg bg-white px-4 py-3 shadow-soft">
            <SelfxLogo />
          </div>
          <Badge className="h-8 rounded-lg border-white/25 bg-white/15 px-3 text-sm text-white backdrop-blur">
            {badge}
          </Badge>
        </header>
        {body}
      </section>

      {showInstallBanner ? <WebKioskInstallBanner /> : null}
    </main>
  );
}

function EndSessionConfirmDialog({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-session-title"
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5"
    >
      <section className="w-full max-w-lg rounded-lg border border-white/20 bg-white p-6 text-stone-950 shadow-soft">
        <XCircleIcon className="size-10 text-destructive" aria-hidden="true" />
        <h2
          id="end-session-title"
          className="mt-4 font-heading text-3xl font-bold leading-tight"
        >
          End this session?
        </h2>
        <p className="mt-3 text-lg leading-7 text-stone-700">
          This will clear the customer photo and Try-On result from this kiosk.
          Make sure the customer has scanned the QR code if they want the
          result on their phone.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            className="h-14 px-6 text-lg"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            className="h-14 px-6 text-lg"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? (
              <RefreshCwIcon className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2Icon className="size-5" aria-hidden="true" />
            )}
            {busy ? "Ending Session" : "End Session"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function StartScreen({
  device,
  notice,
  capabilities,
  configurationStatus,
  configurationError,
  onStartMobileUpload,
  onStartGarmentCapture,
  onStartJewellerySelection,
  onRetryConfiguration,
  onResetPairing,
}: {
  device: KioskDevice | null;
  notice: string | null;
  capabilities: KioskCapabilityAvailability;
  configurationStatus: ConfigurationStatus;
  configurationError: string | null;
  onStartMobileUpload: () => void;
  onStartGarmentCapture: () => void;
  onStartJewellerySelection: () => void;
  onRetryConfiguration: () => void;
  onResetPairing: () => void;
}) {
  const noTryOnCapability =
    configurationStatus === "ready" &&
    !capabilities.garmentTryOnEnabled &&
    !capabilities.jewelleryTryOnEnabled;
  const mobileUploadStatus = capabilities.loading
    ? "Checking settings"
    : !capabilities.garmentTryOnEnabled
      ? "Garment Try-On disabled"
      : !capabilities.mobileUploadEnabled
        ? "Mobile upload unavailable"
        : undefined;
  const garmentStatus = capabilities.loading
    ? "Checking settings"
    : !capabilities.garmentTryOnEnabled
      ? "Disabled for this kiosk"
      : undefined;
  const jewelleryStatus = capabilities.loading
    ? "Checking settings"
    : !capabilities.jewelleryTryOnEnabled
      ? "Disabled for this kiosk"
      : undefined;

  return (
    <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,520px)]">
      <div className="max-w-3xl">
        <p className="mb-4 font-heading text-xl font-semibold text-orange-200">
          SelfX Virtual Try-On
        </p>
        <h1 className="font-heading text-5xl font-bold leading-tight sm:text-6xl">
          Start your Try-On experience
        </h1>
        <p className="mt-5 max-w-2xl text-xl leading-8 text-white/82">
          Choose an option to begin.
        </p>
        {device ? (
          <p className="mt-5 inline-flex rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-base font-semibold text-white backdrop-blur">
            Paired to {device.assignment.organizationName ?? "SelfX Platform"}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-4 inline-flex rounded-lg border border-orange-200/40 bg-orange-200/15 px-4 py-3 text-base font-semibold text-orange-100 backdrop-blur">
            <ClockIcon className="mr-2 size-5 shrink-0" aria-hidden="true" />
            {notice}
          </p>
        ) : null}
        {configurationStatus === "loading" && !configurationError ? (
          <p className="mt-4 inline-flex rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-base font-semibold text-white backdrop-blur">
            <RefreshCwIcon
              className="mr-2 size-5 shrink-0 animate-spin"
              aria-hidden="true"
            />
            Checking kiosk settings...
          </p>
        ) : null}
        {configurationError ? (
          <div className="mt-4 rounded-lg border border-destructive/25 bg-white p-4 text-stone-950 shadow-soft">
            <p className="text-base font-semibold text-destructive">
              {configurationError}
            </p>
            <Button
              variant="outline"
              className="mt-3 h-11 px-4 text-base"
              onClick={onRetryConfiguration}
            >
              <RefreshCwIcon className="size-5" aria-hidden="true" />
              Retry Settings
            </Button>
          </div>
        ) : null}
        {noTryOnCapability ? (
          <p className="mt-4 rounded-lg border border-orange-200/40 bg-orange-200/15 px-4 py-3 text-base font-semibold text-orange-100 backdrop-blur">
            No Try-On capabilities are enabled for this kiosk. Ask staff to
            update the kiosk settings.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4">
        <KioskActionButton
          title="Upload From Mobile"
          description="Send a person photo from a phone."
          icon={MonitorSmartphoneIcon}
          onClick={onStartMobileUpload}
          disabled={!capabilities.mobileUploadEnabled}
          status={mobileUploadStatus}
          tone="primary"
        />
        <KioskActionButton
          title="Try On Garments"
          description="Take a photo at this kiosk."
          icon={ShirtIcon}
          onClick={onStartGarmentCapture}
          disabled={!capabilities.garmentTryOnEnabled}
          status={garmentStatus}
        />
        <KioskActionButton
          title="Try On Jewellery"
          description="Choose jewellery before photo capture."
          icon={GemIcon}
          onClick={onStartJewellerySelection}
          disabled={!capabilities.jewelleryTryOnEnabled}
          status={jewelleryStatus}
        />
        <Button
          variant="ghost"
          className="mt-2 h-12 justify-start border border-white/15 bg-white/10 px-4 text-base text-white hover:bg-white/15"
          onClick={onResetPairing}
        >
          <RefreshCwIcon className="size-5" aria-hidden="true" />
          Pair a different kiosk
        </Button>
      </div>
    </div>
  );
}

function CheckingDeviceScreen() {
  return (
    <div className="grid flex-1 place-items-center py-8">
      <section className="w-full max-w-2xl rounded-lg border border-white/20 bg-white p-8 text-center text-stone-950 shadow-soft">
        <ShieldCheckIcon className="mx-auto size-12 text-primary" aria-hidden="true" />
        <h1 className="mt-5 font-heading text-4xl font-bold leading-tight">
          Checking kiosk
        </h1>
        <p className="mt-4 text-xl leading-8 text-stone-700">
          SelfX is verifying this kiosk before starting a customer session.
        </p>
      </section>
    </div>
  );
}

function MobileUploadScreen({
  session,
  status,
  error,
  onCancel,
  onNewSession,
  onUsePhoto,
}: {
  session: KioskCustomerUploadSession | null;
  status: "idle" | "creating" | "waiting" | "ready" | "saving" | "error";
  error: string | null;
  onCancel: () => void;
  onNewSession: () => void;
  onUsePhoto: () => void;
}) {
  const uploadUrl = session?.publicUploadUrl
    ? absoluteUrl(session.publicUploadUrl)
    : null;
  const waiting =
    status === "creating" ||
    status === "waiting" ||
    session?.status === "UPLOADING" ||
    session?.status === "VALIDATING";
  const saving = status === "saving";
  const ready = (status === "ready" || saving) && session?.photo;

  return (
    <div className="grid flex-1 gap-5 py-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="grid place-items-center rounded-lg border border-white/20 bg-white p-6 text-center text-stone-950 shadow-soft">
        <div className="w-full max-w-xl">
          <MonitorSmartphoneIcon className="mx-auto size-12 text-primary" aria-hidden="true" />
          <h1 className="mt-5 font-heading text-4xl font-bold leading-tight">
            Upload from mobile
          </h1>
          <p className="mt-4 text-xl leading-8 text-stone-700">
            Scan this code with your phone, add a clear photo, then return to
            this kiosk.
          </p>

          <div className="mt-8 grid place-items-center rounded-lg border border-stone-200 bg-stone-50 p-5">
            {uploadUrl ? (
              <QrCodeImage value={uploadUrl} />
            ) : (
              <div className="grid size-[280px] place-items-center rounded-lg bg-white">
                <RefreshCwIcon className="size-10 animate-spin text-primary" aria-hidden="true" />
              </div>
            )}
          </div>

          {uploadUrl ? (
            <p className="mt-4 break-all rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-600">
              {uploadUrl}
            </p>
          ) : null}

          {session ? (
            <p className="mt-3 text-sm font-medium text-stone-500">
              Expires at {formatTime(session.expiresAt)}
            </p>
          ) : null}
        </div>
      </section>

      <aside className="flex flex-col justify-between rounded-lg border border-white/20 bg-white p-5 text-stone-950 shadow-soft">
        <div>
          <Button variant="ghost" onClick={onCancel} className="mb-5 h-11 px-3 text-base">
            <ArrowLeftIcon className="size-5" aria-hidden="true" />
            Back
          </Button>

          <h2 className="font-heading text-3xl font-bold leading-tight">
            {ready ? "Photo received" : waiting ? "Waiting for photo" : "Upload paused"}
          </h2>
          <p className="mt-3 text-lg leading-7 text-stone-700">
            {ready
              ? "Preview the uploaded photo, then use it for garment Try-On."
              : waiting
                ? "The kiosk will update automatically after the phone upload finishes."
                : "Start a new upload session and scan the new code."}
          </p>

          {session?.photo ? (
            <div className="mt-5 overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
              <img
                src={session.photo.readUrl}
                alt="Uploaded customer preview"
                className="max-h-[360px] w-full object-contain"
              />
            </div>
          ) : null}

          {error ? (
            <p className="mt-5 rounded-lg border border-destructive/25 bg-destructive/10 p-4 text-base font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3">
          {ready ? (
            <Button
              className="h-14 px-6 text-lg"
              disabled={saving}
              onClick={onUsePhoto}
            >
              {saving ? (
                <RefreshCwIcon className="size-5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2Icon className="size-5" aria-hidden="true" />
              )}
              {saving ? "Saving Photo" : "Use Photo"}
            </Button>
          ) : null}
          <Button
            variant={ready ? "outline" : "default"}
            className="h-14 px-6 text-lg"
            disabled={status === "creating" || saving}
            onClick={onNewSession}
          >
            <QrCodeIcon className="size-5" aria-hidden="true" />
            New QR Code
          </Button>
          <Button
            variant="ghost"
            className="h-14 px-6 text-lg text-destructive hover:bg-destructive/10"
            onClick={onCancel}
          >
            <XCircleIcon className="size-5" aria-hidden="true" />
            Cancel
          </Button>
        </div>
      </aside>
    </div>
  );
}

function QrCodeImage({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    void toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 280,
      color: {
        dark: "#1c1917",
        light: "#ffffff",
      },
    }).then((nextDataUrl) => {
      if (!cancelled) {
        setDataUrl(nextDataUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!dataUrl) {
    return (
      <div className="grid size-[280px] place-items-center rounded-lg bg-white">
        <RefreshCwIcon className="size-10 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="Mobile upload QR code"
      className="size-[280px] rounded-lg bg-white"
    />
  );
}

function PairingScreen({
  pairingSession,
  pairingState,
  error,
  onRefreshCode,
  onRetry,
}: {
  pairingSession: KioskPairingSession | null;
  pairingState: PairingState;
  error: string | null;
  onRefreshCode: () => void;
  onRetry: () => void;
}) {
  const code = pairingSession?.pairingCode ?? "------";

  return (
    <div className="grid flex-1 place-items-center py-8">
      <section className="w-full max-w-4xl rounded-lg border border-white/20 bg-white p-6 text-stone-950 shadow-soft sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <SmartphoneIcon className="size-12 text-primary" aria-hidden="true" />
            <h1 className="mt-5 font-heading text-4xl font-bold leading-tight">
              Pair this kiosk
            </h1>
            <p className="mt-4 text-xl leading-8 text-stone-700">
              Ask a SelfX admin to open the kiosk pairing screen and enter this
              code.
            </p>

            <div className="mt-8 rounded-lg border border-stone-200 bg-stone-50 p-6 text-center">
              <p className="text-sm font-semibold uppercase text-stone-500">
                Pairing code
              </p>
              <p className="mt-3 font-heading text-6xl font-bold tracking-normal">
                {formatPairingCode(code)}
              </p>
              {pairingSession ? (
                <p className="mt-3 text-sm font-medium text-stone-500">
                  Expires at {formatTime(pairingSession.expiresAt)}
                </p>
              ) : null}
            </div>

            {error ? (
              <p className="mt-5 rounded-lg border border-destructive/25 bg-destructive/10 p-4 text-base font-medium text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col justify-between rounded-lg border border-stone-200 p-5">
            <div>
              <p className="font-heading text-2xl font-bold">
                {pairingState === "creating" ? "Creating code" : null}
                {pairingState === "waiting" ? "Waiting for admin" : null}
                {pairingState === "exchanging" ? "Finishing pairing" : null}
                {pairingState === "expired" ? "Code expired" : null}
                {pairingState === "error" ? "Pairing paused" : null}
                {pairingState === "idle" ? "Ready to pair" : null}
              </p>
              <p className="mt-3 text-base leading-6 text-stone-600">
                The customer Try-On screen opens automatically after this kiosk
                is paired.
              </p>
            </div>

            <div className="mt-8 grid gap-3">
              {pairingState === "expired" ? (
                <Button className="h-14 px-5 text-lg" onClick={onRefreshCode}>
                  <RefreshCwIcon className="size-5" aria-hidden="true" />
                  New Code
                </Button>
              ) : null}
              {pairingState === "error" ? (
                <Button className="h-14 px-5 text-lg" onClick={onRetry}>
                  <RefreshCwIcon className="size-5" aria-hidden="true" />
                  Try Again
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function BlockedDeviceScreen({
  error,
  device,
  onReset,
}: {
  error: string | null;
  device: KioskDevice | null;
  onReset: () => void;
}) {
  return (
    <div className="grid flex-1 place-items-center py-8">
      <section className="w-full max-w-2xl rounded-lg border border-white/20 bg-white p-8 text-stone-950 shadow-soft">
        <XCircleIcon className="size-12 text-destructive" aria-hidden="true" />
        <h1 className="mt-5 font-heading text-4xl font-bold leading-tight">
          Kiosk unavailable
        </h1>
        <p className="mt-4 text-xl leading-8 text-stone-700">
          {error ?? "This kiosk cannot start customer sessions right now."}
        </p>
        {device ? (
          <p className="mt-4 text-base font-medium text-stone-500">
            Device: {device.displayName}
          </p>
        ) : null}
        <Button className="mt-8 h-14 px-6 text-lg" onClick={onReset}>
          Pair Again
        </Button>
      </section>
    </div>
  );
}

function KioskActionButton({
  title,
  description,
  icon: Icon,
  disabled = false,
  status,
  tone = "secondary",
  onClick,
}: {
  title: string;
  description: string;
  icon: typeof ShirtIcon;
  disabled?: boolean;
  status?: string;
  tone?: "primary" | "secondary";
  onClick?: () => void;
}) {
  const className =
    tone === "primary"
      ? "border-primary bg-primary text-primary-foreground hover:border-[var(--selfx-primary-hover)] hover:bg-[var(--selfx-primary-hover)]"
      : "border-white/75 bg-white text-stone-950 hover:border-primary hover:bg-white";

  return (
    <Button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-auto min-h-28 justify-start gap-4 rounded-lg border p-5 text-left text-lg opacity-100 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-100 ${className}`}
    >
      <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-current/10">
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block font-heading text-2xl font-bold leading-7">
          {title}
        </span>
        <span className="mt-2 block whitespace-normal text-base font-normal leading-6 opacity-80">
          {description}
        </span>
        {status ? (
          <span className="mt-3 block text-sm font-semibold uppercase tracking-normal opacity-70">
            {status}
          </span>
        ) : null}
      </span>
    </Button>
  );
}

function ConsentScreen({
  consented,
  guidance,
  guidanceLoading,
  guidanceError,
  onConsentChange,
  onBack,
  onContinue,
}: {
  consented: boolean;
  guidance: CaptureGuidance | null;
  guidanceLoading: boolean;
  guidanceError: string | null;
  onConsentChange: (consented: boolean) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="grid flex-1 place-items-center py-8">
      <section className="w-full max-w-3xl rounded-lg border border-white/20 bg-white p-6 text-stone-950 shadow-soft sm:p-8">
        <Button variant="ghost" onClick={onBack} className="mb-6 h-11 px-3 text-base">
          <ArrowLeftIcon className="size-5" aria-hidden="true" />
          Back
        </Button>

        <h1 className="font-heading text-4xl font-bold leading-tight">
          Photo permission
        </h1>
        <p className="mt-4 text-xl leading-8 text-stone-700">
          SelfX needs your permission before using the camera and preparing your
          photo for virtual try-on.
        </p>

        {guidanceLoading ? (
          <div className="mt-6 rounded-lg border border-stone-200 bg-stone-50 p-5">
            <p className="font-heading text-xl font-bold">
              Loading capture guide
            </p>
            <p className="mt-2 text-base leading-6 text-stone-600">
              SelfX is preparing guidance for the selected jewellery.
            </p>
          </div>
        ) : null}

        {guidance ? (
          <CaptureGuidancePanel guidance={guidance} />
        ) : null}

        {guidanceError ? (
          <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4 text-base font-medium text-orange-800">
            {guidanceError}
          </p>
        ) : null}

        <label className="mt-8 flex items-start gap-4 rounded-lg border border-stone-200 bg-stone-50 p-5 text-left">
          <input
            type="checkbox"
            checked={consented}
            onChange={(event) => onConsentChange(event.target.checked)}
            className="mt-1 size-5"
          />
          <span className="text-lg leading-7 text-stone-800">
            I agree that SelfX can process my photo for this virtual try-on
            session.
          </span>
        </label>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button
            className="h-14 px-6 text-lg"
            disabled={!consented || guidanceLoading}
            onClick={onContinue}
          >
            <CameraIcon className="size-5" aria-hidden="true" />
            Continue
          </Button>
          <Button
            variant="outline"
            className="h-14 px-6 text-lg"
            onClick={onBack}
          >
            Cancel
          </Button>
        </div>
      </section>
    </div>
  );
}

function CameraScreen({
  videoRef,
  status,
  error,
  guidance,
  onBack,
  onCapture,
  onRetry,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: string | null;
  guidance: CaptureGuidance | null;
  onBack: () => void;
  onCapture: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="grid flex-1 gap-5 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="relative min-h-[540px] overflow-hidden rounded-lg border border-white/20 bg-black shadow-soft">
        <video
          ref={videoRef}
          className="size-full object-cover"
          autoPlay
          muted
          playsInline
        />
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-8">
          <CaptureGuideOverlay guide={guidance?.guide} />
        </div>
        {status === "starting" ? <CameraOverlay title="Starting camera" /> : null}
        {status === "capturing" ? <CameraOverlay title="Capturing photo" /> : null}
        {status === "error" ? (
          <CameraOverlay title="Camera unavailable" description={error} />
        ) : null}
      </section>

      <aside className="flex flex-col justify-between rounded-lg border border-white/20 bg-white p-5 text-stone-950 shadow-soft">
        <div>
          <Button variant="ghost" onClick={onBack} className="mb-5 h-11 px-3 text-base">
            <ArrowLeftIcon className="size-5" aria-hidden="true" />
            Back
          </Button>
          <h1 className="font-heading text-3xl font-bold leading-tight">
            {guidance?.title ?? "Get ready"}
          </h1>
          <p className="mt-3 text-lg leading-7 text-stone-700">
            {guidance?.instruction ??
              "Face the camera and keep your full outfit visible."}
          </p>
          {guidance ? (
            <Checklist items={guidance.checklist} className="mt-5" />
          ) : null}
        </div>

        <div className="mt-6 grid gap-3">
          {status === "error" ? (
            <Button className="h-14 px-6 text-lg" onClick={onRetry}>
              <RefreshCwIcon className="size-5" aria-hidden="true" />
              Try Again
            </Button>
          ) : (
            <Button
              className="h-16 px-6 text-xl"
              disabled={status !== "ready"}
              onClick={onCapture}
            >
              <CameraIcon className="size-6" aria-hidden="true" />
              Take Photo
            </Button>
          )}
          <Button variant="outline" className="h-14 px-6 text-lg" onClick={onBack}>
            Cancel
          </Button>
        </div>
      </aside>
    </div>
  );
}

function CameraOverlay({
  title,
  description,
}: {
  title: string;
  description?: string | null;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/70 p-6 text-center">
      <div className="max-w-md rounded-lg bg-white p-6 text-stone-950 shadow-soft">
        <p className="font-heading text-2xl font-bold">{title}</p>
        {description ? (
          <p className="mt-3 text-base leading-6 text-stone-700">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

function CaptureGuideOverlay({ guide }: { guide?: string }) {
  const guideClass = guideOverlayClass(guide);

  return (
    <div
      className={`${guideClass} border-4 border-white/80 shadow-[0_0_0_999px_rgb(0_0_0/0.24)]`}
    />
  );
}

function CaptureGuidancePanel({
  guidance,
  compact = false,
}: {
  guidance: CaptureGuidance;
  compact?: boolean;
}) {
  return (
    <div className="mt-5 rounded-lg border border-primary/20 bg-primary/5 p-5">
      <div className="flex items-start gap-3">
        <GemIcon className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="font-heading text-xl font-bold text-stone-950">
            {guidance.title}
          </p>
          <p className="mt-2 text-base leading-6 text-stone-700">
            {guidance.instruction}
          </p>
        </div>
      </div>
      {!compact ? (
        <Checklist items={guidance.checklist} className="mt-4" />
      ) : null}
    </div>
  );
}

function Checklist({
  items,
  className = "",
}: {
  items: string[];
  className?: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className={`grid gap-2 ${className}`}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-base leading-6 text-stone-700">
          <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function guideOverlayClass(guide?: string): string {
  switch (guide) {
    case "HAND_CLOSE_UP":
      return "h-[min(52%,340px)] w-[min(78%,520px)] rounded-[32px]";
    case "WRIST_CLOSE_UP":
      return "h-[min(42%,280px)] w-[min(82%,560px)] rounded-[999px]";
    case "NECK_AND_UPPER_CHEST":
      return "h-[min(70%,500px)] w-[min(72%,460px)] rounded-[42%]";
    case "FACE_AND_EARS":
      return "h-[min(64%,430px)] w-[min(72%,460px)] rounded-[46%]";
    default:
      return "h-full max-h-[82%] w-[min(68%,420px)] rounded-[48%]";
  }
}

function ReviewScreen({
  photo,
  uploadStatus,
  uploadError,
  guidance,
  activeVertical,
  onBack,
  onRetake,
  onContinue,
}: {
  photo: CapturedPhoto | null;
  uploadStatus: PersonUploadStatus;
  uploadError: string | null;
  guidance: CaptureGuidance | null;
  activeVertical: ProductVertical;
  onBack: () => void;
  onRetake: () => void;
  onContinue: () => void;
}) {
  const checking = uploadStatus === "checking";
  const saving = uploadStatus === "saving";
  const busy = checking || saving;
  const isJewellery = activeVertical === "JEWELLERY";

  return (
    <div className="grid flex-1 gap-5 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="grid min-h-[540px] place-items-center overflow-hidden rounded-lg border border-white/20 bg-black shadow-soft">
        {photo ? (
          <img
            src={photo.url}
            alt="Captured customer preview"
            className="size-full object-contain"
          />
        ) : (
          <CameraOverlay title="No photo captured" />
        )}
      </section>

      <aside className="flex flex-col justify-between rounded-lg border border-white/20 bg-white p-5 text-stone-950 shadow-soft">
        <div>
          <Button variant="ghost" onClick={onBack} className="mb-5 h-11 px-3 text-base">
            <ArrowLeftIcon className="size-5" aria-hidden="true" />
            Start Over
          </Button>
          <h1 className="font-heading text-3xl font-bold leading-tight">
            Review photo
          </h1>
          <p className="mt-3 text-lg leading-7 text-stone-700">
            {isJewellery
              ? "Make sure the jewellery area is clear before continuing."
              : "Make sure you are comfortable with this photo before continuing."}
          </p>
          {guidance ? (
            <CaptureGuidancePanel guidance={guidance} compact />
          ) : null}
          {photo ? (
            <p className="mt-4 text-sm font-medium text-stone-500">
              {photo.width} x {photo.height}
            </p>
          ) : null}
          {uploadError ? (
            <p className="mt-4 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {uploadError}
            </p>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3">
          <Button
            className="h-16 px-6 text-xl"
            disabled={!photo || busy}
            onClick={onContinue}
          >
            {busy ? (
              <RefreshCwIcon className="size-6 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2Icon className="size-6" aria-hidden="true" />
            )}
            {checking
              ? "Checking Photo"
              : saving
                ? isJewellery
                ? "Creating Try-On"
                : "Saving Photo"
                : isJewellery
                  ? "Use Photo & Try On"
                  : "Use Photo"}
          </Button>
          <Button
            variant="outline"
            className="h-14 px-6 text-lg"
            disabled={busy}
            onClick={onRetake}
          >
            <RotateCcwIcon className="size-5" aria-hidden="true" />
            Retake
          </Button>
        </div>
      </aside>
    </div>
  );
}

function PhotoReadyScreen({
  photo,
  session,
  asset,
  onChooseGarment,
  onRetake,
  onStartOver,
}: {
  photo: PersonPhotoPreview | null;
  session: KioskTryOnSession | null;
  asset: KioskTryOnAsset | null;
  onChooseGarment: () => void;
  onRetake: () => void;
  onStartOver: () => void;
}) {
  return (
    <div className="grid flex-1 place-items-center py-8">
      <section className="grid w-full max-w-5xl gap-6 rounded-lg border border-white/20 bg-white p-6 text-stone-950 shadow-soft lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-h-[420px] overflow-hidden rounded-lg bg-stone-950">
          {photo ? (
            <img
              src={photo.url}
              alt="Accepted customer preview"
              className="size-full object-contain"
            />
          ) : null}
        </div>
        <div className="flex flex-col justify-between">
          <div>
            <CheckCircle2Icon className="size-12 text-emerald-600" aria-hidden="true" />
            <h1 className="mt-5 font-heading text-4xl font-bold leading-tight">
              Photo ready
            </h1>
            <p className="mt-4 text-xl leading-8 text-stone-700">
              Your photo is saved to this kiosk session and ready for the next
              Try-On step.
            </p>
            {session && asset ? (
              <div className="mt-5 rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm font-medium text-stone-600">
                <p>Session: {shortId(session.sessionId)}</p>
                <p className="mt-1">
                  Photo: {asset.width} x {asset.height}
                </p>
              </div>
            ) : null}
          </div>
          <div className="mt-8 grid gap-3">
            <Button className="h-16 px-6 text-xl" onClick={onChooseGarment}>
              <ShirtIcon className="size-6" aria-hidden="true" />
              Choose Garment
            </Button>
            <Button variant="outline" className="h-14 px-6 text-lg" onClick={onRetake}>
              <RotateCcwIcon className="size-5" aria-hidden="true" />
              Retake
            </Button>
            <Button
              variant="ghost"
              className="h-14 px-6 text-lg text-destructive hover:bg-destructive/10"
              onClick={onStartOver}
            >
              <XCircleIcon className="size-5" aria-hidden="true" />
              New Customer
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function CatalogScreen({
  products,
  status,
  error,
  vertical,
  completedLooks,
  onBack,
  onRetry,
  onSelect,
}: {
  products: KioskCatalogProduct[];
  status: CatalogStatus;
  error: string | null;
  vertical: ProductVertical;
  completedLooks: CompletedLook[];
  onBack: () => void;
  onRetry: () => void;
  onSelect: (product: KioskCatalogProduct) => void;
}) {
  const isJewellery = vertical === "JEWELLERY";
  const label = isJewellery ? "jewellery" : "garment";
  const title = isJewellery ? "Choose jewellery" : "Choose a garment";
  const description = isJewellery
    ? "Select one jewellery item before taking your photo."
    : "Select one item to create your virtual Try-On.";

  return (
    <div className="flex flex-1 flex-col gap-5 py-6">
      <div className="flex flex-col gap-4 rounded-lg border border-white/20 bg-white p-5 text-stone-950 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold leading-tight">
            {title}
          </h1>
          <p className="mt-2 text-lg leading-7 text-stone-700">
            {description}
          </p>
        </div>
        <Button variant="outline" className="h-12 px-5 text-base" onClick={onBack}>
          <ArrowLeftIcon className="size-5" aria-hidden="true" />
          Back
        </Button>
      </div>

      {completedLooks.length > 0 ? (
        <LooksThisSession looks={completedLooks} />
      ) : null}

      {status === "loading" || status === "idle" ? (
        <CatalogMessage
          title="Loading catalog"
          description={`Getting ${label} products available for this kiosk.`}
          vertical={vertical}
        />
      ) : null}

      {status === "empty" ? (
        <CatalogMessage
          title={`No ${label} available`}
          description={`This kiosk does not have ${label} products ready yet. Please ask staff for help.`}
          vertical={vertical}
        />
      ) : null}

      {status === "error" ? (
        <CatalogMessage
          title="Catalog unavailable"
          description={error ?? "Catalog could not be loaded."}
          vertical={vertical}
          action={
            <Button className="mt-5 h-12 px-5 text-base" onClick={onRetry}>
              <RefreshCwIcon className="size-5" aria-hidden="true" />
              Try Again
            </Button>
          }
        />
      ) : null}

      {status === "ready" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {products.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onSelect(product)}
              className="overflow-hidden rounded-lg border border-white/20 bg-white text-left text-stone-950 shadow-soft transition hover:-translate-y-0.5 hover:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/35"
            >
              <div className="grid aspect-[4/5] place-items-center bg-stone-100">
                {product.image.url ? (
                  <img
                    src={product.image.url}
                    alt={product.name}
                    className="size-full object-contain"
                  />
                ) : (
                  <ShirtIcon className="size-14 text-stone-400" aria-hidden="true" />
                )}
              </div>
              <div className="p-4">
                <p className="font-heading text-xl font-bold leading-6">
                  {product.name}
                </p>
                <p className="mt-2 text-sm font-medium text-stone-500">
                  {product.productVertical === "JEWELLERY"
                    ? formatJewelleryType(product.jewelleryType)
                    : product.category.name}
                </p>
                <p className="mt-3 text-base font-semibold text-primary">
                  {formatPrice(product)}
                </p>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CatalogMessage({
  title,
  description,
  vertical,
  action,
}: {
  title: string;
  description: string;
  vertical: ProductVertical;
  action?: ReactNode;
}) {
  const Icon = vertical === "JEWELLERY" ? GemIcon : ShirtIcon;
  return (
    <section className="grid flex-1 place-items-center rounded-lg border border-white/20 bg-white p-8 text-center text-stone-950 shadow-soft">
      <div>
        <Icon className="mx-auto size-12 text-primary" aria-hidden="true" />
        <h2 className="mt-5 font-heading text-3xl font-bold">{title}</h2>
        <p className="mt-3 max-w-xl text-lg leading-7 text-stone-700">
          {description}
        </p>
        {action}
      </div>
    </section>
  );
}

function GeneratingScreen({
  product,
  run,
}: {
  product: KioskCatalogProduct | null;
  run: KioskTryOnRun | null;
}) {
  return (
    <div className="grid flex-1 place-items-center py-8">
      <section className="w-full max-w-3xl rounded-lg border border-white/20 bg-white p-8 text-center text-stone-950 shadow-soft">
        <RefreshCwIcon className="mx-auto size-14 animate-spin text-primary" aria-hidden="true" />
        <h1 className="mt-6 font-heading text-4xl font-bold leading-tight">
          Creating your look
        </h1>
        <p className="mt-4 text-xl leading-8 text-stone-700">
          {product ? `Trying on ${product.name}.` : "Preparing your Try-On."}
        </p>
        <p className="mt-4 text-base font-medium text-stone-500">
          {run ? `Status: ${run.status}` : "Submitting Try-On"}
        </p>
      </section>
    </div>
  );
}

function ResultScreen({
  photo,
  product,
  run,
  error,
  completedLooks,
  share,
  shareStatus,
  shareError,
  onCreateShare,
  onRetry,
  onTryAnother,
  onRetake,
  onStartOver,
}: {
  photo: PersonPhotoPreview | null;
  product: KioskCatalogProduct | null;
  run: KioskTryOnRun | null;
  error: string | null;
  completedLooks: CompletedLook[];
  share: KioskTryOnShare | null;
  shareStatus: "idle" | "creating" | "ready" | "error";
  shareError: string | null;
  onCreateShare: () => void;
  onRetry: () => void;
  onTryAnother: () => void;
  onRetake: () => void;
  onStartOver: () => void;
}) {
  const failed =
    Boolean(error) || run?.status === "FAILED" || (run?.status === "COMPLETED" && !run.resultImage);
  const resultImage = run?.resultImage;

  return (
    <div className="grid flex-1 gap-5 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="grid gap-4 md:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-white/20 bg-black shadow-soft">
          <div className="border-b border-white/10 bg-white/10 px-4 py-3 text-base font-semibold">
            Your Photo
          </div>
          <div className="grid min-h-[480px] place-items-center">
            {photo ? (
              <img
                src={photo.url}
                alt="Customer photo"
                className="size-full object-contain"
              />
            ) : null}
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-white/20 bg-black shadow-soft">
          <div className="border-b border-white/10 bg-white/10 px-4 py-3 text-base font-semibold">
            Try-On Result
          </div>
          <div className="grid min-h-[480px] place-items-center p-4">
            {resultImage && !failed ? (
              <img
                src={resultImage}
                alt="Generated Try-On result"
                className="size-full object-contain"
              />
            ) : (
              <div className="max-w-sm text-center text-white">
                <XCircleIcon className="mx-auto size-12 text-orange-200" aria-hidden="true" />
                <p className="mt-4 font-heading text-2xl font-bold">
                  Try-On not ready
                </p>
                <p className="mt-3 text-base leading-6 text-white/75">
                  {error ?? run?.errorMessage ?? "The Try-On could not be completed."}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <aside className="flex flex-col justify-between rounded-lg border border-white/20 bg-white p-5 text-stone-950 shadow-soft">
        <div>
          <h1 className="font-heading text-3xl font-bold leading-tight">
            {failed ? "Try-On failed" : "Your Try-On is ready"}
          </h1>
          <p className="mt-3 text-lg leading-7 text-stone-700">
            {product ? product.name : "Selected garment"}
          </p>
          {run ? (
            <p className="mt-4 text-sm font-medium text-stone-500">
              Run: {shortId(run.id)}
            </p>
          ) : null}
          {completedLooks.length > 0 ? (
            <div className="mt-5">
              <LooksThisSession looks={completedLooks} compact />
            </div>
          ) : null}
          {!failed ? (
            <ResultSharePanel
              share={share}
              status={shareStatus}
              error={shareError}
              onCreateShare={onCreateShare}
            />
          ) : null}
        </div>

        <div className="mt-6 grid gap-3">
          {failed ? (
            <Button className="h-14 px-6 text-lg" onClick={onRetry}>
              <RefreshCwIcon className="size-5" aria-hidden="true" />
              Try Again
            </Button>
          ) : (
            <Button className="h-14 px-6 text-lg" onClick={onTryAnother}>
              <ShirtIcon className="size-5" aria-hidden="true" />
              Try Another
            </Button>
          )}
          {failed ? (
            <Button
              variant="outline"
              className="h-14 px-6 text-lg"
              onClick={onTryAnother}
            >
              <ShirtIcon className="size-5" aria-hidden="true" />
              Choose Another
            </Button>
          ) : null}
          <Button variant="outline" className="h-14 px-6 text-lg" onClick={onRetake}>
            <RotateCcwIcon className="size-5" aria-hidden="true" />
            Retake Photo
          </Button>
          <Button
            variant="ghost"
            className="h-14 px-6 text-lg text-destructive hover:bg-destructive/10"
            onClick={onStartOver}
          >
            <XCircleIcon className="size-5" aria-hidden="true" />
            New Customer
          </Button>
        </div>
      </aside>
    </div>
  );
}

function LooksThisSession({
  looks,
  compact = false,
}: {
  looks: CompletedLook[];
  compact?: boolean;
}) {
  return (
    <section className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-stone-950">
      <div className="flex items-center gap-2">
        <HistoryIcon className="size-5 text-primary" aria-hidden="true" />
        <h2 className="font-heading text-xl font-bold">
          Looks this session
        </h2>
      </div>
      <div
        className={
          compact
            ? "mt-4 grid grid-cols-3 gap-3"
            : "mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6"
        }
      >
        {looks.map((look) => (
          <div key={look.runId} className="min-w-0">
            <div className="aspect-[4/5] overflow-hidden rounded-md bg-stone-200">
              <img
                src={look.resultImage}
                alt={look.productName}
                className="size-full object-cover"
              />
            </div>
            <p className="mt-2 truncate text-sm font-semibold text-stone-700">
              {look.productName}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ResultSharePanel({
  share,
  status,
  error,
  onCreateShare,
}: {
  share: KioskTryOnShare | null;
  status: "idle" | "creating" | "ready" | "error";
  error: string | null;
  onCreateShare: () => void;
}) {
  const shareUrl = share?.shareUrl ? absoluteUrl(share.shareUrl) : null;

  return (
    <section className="mt-5 rounded-lg border border-stone-200 bg-stone-50 p-4 text-stone-950">
      <div className="flex items-start gap-3">
        <QrCodeIcon className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h2 className="font-heading text-xl font-bold">Send to phone</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Scan a private, temporary link to view your generated looks.
          </p>
        </div>
      </div>

      {shareUrl ? (
        <div className="mt-4 grid place-items-center rounded-lg border border-stone-200 bg-white p-3">
          <QrCodeImage value={shareUrl} />
        </div>
      ) : null}

      {shareUrl ? (
        <p className="mt-3 break-all rounded-md border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600">
          {shareUrl}
        </p>
      ) : null}

      {share ? (
        <p className="mt-2 text-xs font-medium text-stone-500">
          Link expires at {formatTime(share.expiresAt)}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <Button
        variant={shareUrl ? "outline" : "default"}
        className="mt-4 h-12 w-full px-5 text-base"
        disabled={status === "creating"}
        onClick={onCreateShare}
      >
        {status === "creating" ? (
          <RefreshCwIcon className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <QrCodeIcon className="size-5" aria-hidden="true" />
        )}
        {shareUrl ? "Refresh QR Code" : "Show QR Code"}
      </Button>
    </section>
  );
}

function getKioskCapabilityAvailability(
  configuration: KioskConfiguration | null,
  status: ConfigurationStatus,
): KioskCapabilityAvailability {
  const loading = !configuration && (status === "idle" || status === "loading");
  const enabledCapabilities =
    configuration?.experience.enabledTryOnCapabilities ?? [];
  const garmentTryOnEnabled = enabledCapabilities.includes("GARMENT_TRY_ON");
  const jewelleryTryOnEnabled =
    enabledCapabilities.includes("JEWELLERY_TRY_ON");
  const mobileUploadEnabled =
    garmentTryOnEnabled && isCustomerCaptureUploadSupported(configuration);

  return {
    loading,
    garmentTryOnEnabled,
    jewelleryTryOnEnabled,
    mobileUploadEnabled,
  };
}

function isCustomerCaptureUploadSupported(
  configuration: KioskConfiguration | null,
): boolean {
  return Boolean(
    configuration &&
      configuration.captureUpload.maxImageBytes > 0 &&
      configuration.captureUpload.supportedContentTypes.some((contentType) =>
        contentType.toLowerCase().startsWith("image/"),
      ),
  );
}

function getCustomerSessionIdleTimeoutMs(
  configuration: KioskConfiguration | null,
): number {
  const seconds = configuration?.experience.sessionIdleTimeoutSeconds;
  if (!seconds || seconds <= 0) {
    return defaultCustomerSessionIdleTimeoutMs;
  }

  return seconds * 1000;
}

function getOrCreateInstallationId(): string {
  const existing = window.localStorage.getItem(installationIdStorageKey);
  if (existing) {
    return existing;
  }

  const generated =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(installationIdStorageKey, generated);
  return generated;
}

function loadStoredDeviceAuth(): KioskDeviceAuth | null {
  const raw = window.localStorage.getItem(deviceSessionStorageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<KioskDeviceAuth>;
    if (
      typeof parsed.accessToken === "string" &&
      typeof parsed.accessTokenExpiresAt === "string" &&
      typeof parsed.refreshToken === "string" &&
      typeof parsed.refreshTokenExpiresAt === "string" &&
      parsed.device &&
      typeof parsed.device.id === "string"
    ) {
      return parsed as KioskDeviceAuth;
    }
  } catch {
    clearStoredDeviceAuth();
  }

  return null;
}

function saveDeviceAuth(auth: KioskDeviceAuth): void {
  window.localStorage.setItem(deviceSessionStorageKey, JSON.stringify(auth));
}

function clearStoredDeviceAuth(): void {
  window.localStorage.removeItem(deviceSessionStorageKey);
}

function getSafeMessage(error: unknown, fallback: string): string {
  if (error instanceof SafeApiError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function shortId(value: string): string {
  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function createClientRequestId(): string {
  return typeof window.crypto?.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `web-run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatPrice(product: KioskCatalogProduct): string {
  if (product.priceAmountCents === null || !product.priceCurrency) {
    return "Try-On available";
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: product.priceCurrency,
    }).format(product.priceAmountCents / 100);
  } catch {
    return `${product.priceCurrency} ${(product.priceAmountCents / 100).toFixed(2)}`;
  }
}

function formatJewelleryType(value: string | null): string {
  if (!value) {
    return "Jewellery";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function absoluteUrl(value: string): string {
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return value;
  }
}

function fallbackJewelleryGuidance(
  product: KioskCatalogProduct | null,
): CaptureGuidance | null {
  if (product?.productVertical !== "JEWELLERY") {
    return null;
  }

  switch (product.jewelleryType) {
    case "RING":
      return {
        jewelleryType: "RING",
        guide: "HAND_CLOSE_UP",
        title: "Show your hand clearly",
        instruction:
          "Keep your hand open, steady and fully visible inside the guide.",
        checklist: [
          "Keep every finger visible.",
          "Remove anything covering the target finger.",
          "Use even lighting without strong shadows.",
        ],
        requiredChecks: [
          "TECHNICAL_IMAGE_VALIDITY",
          "MINIMUM_RESOLUTION",
          "SHARPNESS",
          "EXPOSURE",
          "CAPTURE_SUBJECT_PRESENT",
          "REQUIRED_REGION_VISIBLE",
          "RELEVANT_REGION_UNOBSTRUCTED",
        ],
      };
    case "BRACELET":
      return {
        jewelleryType: "BRACELET",
        guide: "WRIST_CLOSE_UP",
        title: "Show your wrist clearly",
        instruction:
          "Keep your wrist and lower forearm steady and fully visible inside the guide.",
        checklist: [
          "Keep the wrist facing the camera.",
          "Remove anything covering the wrist.",
          "Use even lighting without strong shadows.",
        ],
        requiredChecks: [
          "TECHNICAL_IMAGE_VALIDITY",
          "MINIMUM_RESOLUTION",
          "SHARPNESS",
          "EXPOSURE",
          "CAPTURE_SUBJECT_PRESENT",
          "REQUIRED_REGION_VISIBLE",
          "RELEVANT_REGION_UNOBSTRUCTED",
        ],
      };
    case "NECKLACE":
      return {
        jewelleryType: "NECKLACE",
        guide: "NECK_AND_UPPER_CHEST",
        title: "Keep your neckline visible",
        instruction:
          "Face the camera and keep your neck, shoulders and upper chest visible inside the guide.",
        checklist: [
          "Look directly toward the camera.",
          "Move hair or clothing away from the neckline.",
          "Use even lighting across the face and neck.",
        ],
        requiredChecks: [
          "TECHNICAL_IMAGE_VALIDITY",
          "MINIMUM_RESOLUTION",
          "SHARPNESS",
          "EXPOSURE",
          "CAPTURE_SUBJECT_PRESENT",
          "REQUIRED_REGION_VISIBLE",
          "FRONT_FACING",
          "RELEVANT_REGION_UNOBSTRUCTED",
        ],
      };
    case "EARRING":
      return {
        jewelleryType: "EARRING",
        guide: "FACE_AND_EARS",
        title: "Keep your face and one ear visible",
        instruction:
          "Keep your face and at least one ear clearly visible inside the guide.",
        checklist: [
          "Turn slightly if it makes the earring side clearer.",
          "Move hair and accessories away from the visible ear.",
          "Use even lighting across the face and ear.",
        ],
        requiredChecks: [
          "TECHNICAL_IMAGE_VALIDITY",
          "MINIMUM_RESOLUTION",
          "SHARPNESS",
          "EXPOSURE",
          "CAPTURE_SUBJECT_PRESENT",
          "REQUIRED_REGION_VISIBLE",
          "RELEVANT_REGION_UNOBSTRUCTED",
        ],
      };
    default:
      return {
        jewelleryType: product.jewelleryType ?? "JEWELLERY",
        guide: "FACE_AND_EARS",
        title: "Show the jewellery area clearly",
        instruction:
          "Keep the area for this jewellery item clearly visible inside the guide.",
        checklist: [
          "Keep the area steady.",
          "Move hair, clothing or accessories away.",
          "Use even lighting without strong shadows.",
        ],
        requiredChecks: [
          "TECHNICAL_IMAGE_VALIDITY",
          "MINIMUM_RESOLUTION",
          "SHARPNESS",
          "EXPOSURE",
          "CAPTURE_SUBJECT_PRESENT",
          "REQUIRED_REGION_VISIBLE",
        ],
      };
  }
}

function jewelleryPreflightIssue(
  evidence: SelfxJewelleryPersonSemanticEvidence,
  guidance: CaptureGuidance | null,
): string | null {
  if (!evidence.analysisAvailable) {
    return "We could not verify this photo. Please retake it with the guide visible.";
  }
  if (!evidence.subjectPresent) {
    return guidance?.jewelleryType === "RING" ||
      guidance?.jewelleryType === "BRACELET"
      ? "Keep your hand and wrist clearly visible, then retake the photo."
      : "Keep your face clearly visible, then retake the photo.";
  }
  if (evidence.confidence === null || evidence.confidence < 0.55) {
    return "We could not verify this photo. Please retake it with steadier framing.";
  }
  if (!evidence.requiredRegionVisible) {
    return (
      guidance?.instruction ??
      "Keep the required jewellery area clearly visible, then retake the photo."
    );
  }
  if (
    guidance?.requiredChecks.includes("FRONT_FACING") &&
    evidence.frontFacing !== true
  ) {
    return "Face the camera directly, then retake the photo.";
  }
  if (
    guidance?.requiredChecks.includes("RELEVANT_REGION_UNOBSTRUCTED") &&
    evidence.relevantRegionUnobstructed !== true
  ) {
    switch (guidance.jewelleryType) {
      case "RING":
        return "Remove anything covering your fingers, then retake the photo.";
      case "BRACELET":
        return "Remove anything covering your wrist, then retake the photo.";
      case "NECKLACE":
        return "Move hair or clothing away from your neckline, then retake the photo.";
      case "EARRING":
        return "Move hair and accessories away from the visible ear, then retake the photo.";
      default:
        return "Keep the jewellery area uncovered, then retake the photo.";
    }
  }

  return null;
}

function supportedJewelleryType(
  value: string | null | undefined,
): SelfxJewelleryType | null {
  switch (value) {
    case "RING":
    case "BRACELET":
    case "NECKLACE":
    case "EARRING":
      return value;
    default:
      return null;
  }
}

function formatPairingCode(code: string): string {
  if (/^\d{6}$/.test(code)) {
    return `${code.slice(0, 3)} ${code.slice(3)}`;
  }
  return code;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
