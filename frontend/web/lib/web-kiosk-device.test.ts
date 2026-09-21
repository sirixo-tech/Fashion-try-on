import { afterEach, describe, expect, it, vi } from "vitest";

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
  getKioskJewelleryCaptureRequirements,
  getKioskCustomerUploadSession,
  getKioskTryOnRun,
  getKioskPairingStatus,
  listKioskCatalogProducts,
  refreshKioskDeviceSession,
  sendKioskHeartbeat,
  setKioskTryOnSessionPersonFromCustomerUpload,
  setKioskTryOnSessionPerson,
} from "@/lib/web-kiosk-device";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("web kiosk device API", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("creates a pairing session with web kiosk installation metadata", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        pairingSessionId: "session-1",
        pairingCode: "123456",
        provisioningSecret: "secret",
        expiresAt: "2026-09-18T17:00:00.000Z",
        serverTime: "2026-09-18T16:52:00.000Z",
        ttlSeconds: 480,
        pollIntervalSeconds: 3,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createKioskPairingSession({
      installationId: "install-1",
      platform: "web-pwa",
      appVersion: "web-kiosk-pwa",
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/kiosk/provisioning/sessions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      installationId: "install-1",
      platform: "web-pwa",
      appVersion: "web-kiosk-pwa",
    });
  });

  it("polls pairing status with the provisioning secret header", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "WAITING",
        serverTime: "2026-09-18T16:52:00.000Z",
        expiresAt: "2026-09-18T17:00:00.000Z",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getKioskPairingStatus({
      pairingSessionId: "session-1",
      provisioningSecret: "secret",
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/kiosk/provisioning/sessions/session-1",
      expect.anything(),
    );
    expect(new Headers(init?.headers).get("x-selfx-provisioning-secret")).toBe(
      "secret",
    );
  });

  it("exchanges a provisioning grant and uses bearer tokens for device calls", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({ ok: true })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await exchangeKioskProvisioningGrant(
      { pairingSessionId: "session-1", provisioningSecret: "secret" },
      "grant",
    );
    await refreshKioskDeviceSession("refresh");
    await getCurrentKioskDevice("access-token");
    await sendKioskHeartbeat("access-token");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/kiosk/session/exchange",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/kiosk/session/refresh",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      new Headers(fetchMock.mock.calls[2]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer access-token");
    expect(
      new Headers(fetchMock.mock.calls[3]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer access-token");
  });

  it("fetches the device-authenticated runtime configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        version: 2,
        experience: {
          enabledTryOnCapabilities: ["GARMENT_TRY_ON"],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getCurrentKioskConfiguration("access-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/kiosk/configuration",
      expect.anything(),
    );
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer access-token");
  });

  it("creates kiosk Try-On sessions, uploads person photos, shares looks and completes sessions", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({ ok: true })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createKioskTryOnSession("access-token");
    await setKioskTryOnSessionPerson(
      "access-token",
      "session-1",
      new Blob(["person"], { type: "image/jpeg" }),
    );
    await setKioskTryOnSessionPersonFromCustomerUpload(
      "access-token",
      "session-1",
      "upload-1",
    );
    await createKioskTryOnShare("access-token", "session-1");
    await completeKioskTryOnSession("access-token", "session-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/kiosk/try-on/sessions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/kiosk/try-on/sessions/session-1/person",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/kiosk/try-on/sessions/session-1/person",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/v1/kiosk/try-on/sessions/session-1/share",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/v1/kiosk/try-on/sessions/session-1/complete",
      expect.objectContaining({ method: "POST" }),
    );

    const personUploadInit = fetchMock.mock.calls[1]?.[1];
    expect(personUploadInit?.body).toBeInstanceOf(FormData);
    expect(
      new Headers(personUploadInit?.headers).get("Authorization"),
    ).toBe("Bearer access-token");
    expect(new Headers(personUploadInit?.headers).has("Content-Type")).toBe(
      false,
    );
    const mobileUploadInit = fetchMock.mock.calls[2]?.[1];
    expect(JSON.parse(String(mobileUploadInit?.body))).toEqual({
      customerUploadSessionId: "upload-1",
    });
  });

  it("creates, polls and cancels kiosk customer upload sessions", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({ ok: true })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createKioskCustomerUploadSession("access-token", "MODEL");
    await getKioskCustomerUploadSession("access-token", "upload-1");
    await cancelKioskCustomerUploadSession("access-token", "upload-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/kiosk/customer-upload-sessions?purpose=MODEL",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/kiosk/customer-upload-sessions/upload-1",
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/kiosk/customer-upload-sessions/upload-1/cancel",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("lists kiosk catalog products and creates catalog Try-On runs", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({ ok: true })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await listKioskCatalogProducts("access-token", {
      productVertical: "GARMENT",
      pageSize: 12,
    });
    await getKioskJewelleryCaptureRequirements("access-token", "jewellery-1");
    await createKioskTryOnRun("access-token", {
      sessionId: "session-1",
      personAssetId: "person-1",
      productId: "product-1",
      clientRequestId: "request-1",
    });
    await getKioskTryOnRun("access-token", "run-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/kiosk/catalog/products?productVertical=GARMENT&pageSize=12",
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/kiosk/catalog/products/jewellery-1/capture-requirements",
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/kiosk/try-on/runs",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/v1/kiosk/try-on/runs/run-1",
      expect.anything(),
    );

    const createRunInit = fetchMock.mock.calls[2]?.[1];
    const formData = createRunInit?.body as FormData;
    expect(formData.get("clientRequestId")).toBe("request-1");
    expect(formData.get("sessionId")).toBe("session-1");
    expect(formData.get("personAssetId")).toBe("person-1");
    expect(formData.get("productId")).toBe("product-1");
    expect(formData.get("tryOnVertical")).toBe("GARMENT");
    expect(formData.get("garmentSource")).toBe("SELFX_CATALOG");
    expect(new Headers(createRunInit?.headers).has("Content-Type")).toBe(false);
  });

  it("creates catalog jewellery Try-On runs without client-selected jewellery type", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({ ok: true })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createKioskTryOnRun("access-token", {
      sessionId: "session-1",
      personAssetId: "person-1",
      productId: "jewellery-1",
      clientRequestId: "request-1",
      tryOnVertical: "JEWELLERY",
    });

    const createRunInit = fetchMock.mock.calls[0]?.[1];
    const formData = createRunInit?.body as FormData;
    expect(formData.get("clientRequestId")).toBe("request-1");
    expect(formData.get("sessionId")).toBe("session-1");
    expect(formData.get("personAssetId")).toBe("person-1");
    expect(formData.get("productId")).toBe("jewellery-1");
    expect(formData.get("tryOnVertical")).toBe("JEWELLERY");
    expect(formData.get("catalogSource")).toBe("SELFX_CATALOG");
    expect(formData.has("jewelleryType")).toBe(false);
    expect(formData.has("garmentSource")).toBe(false);
    expect(new Headers(createRunInit?.headers).has("Content-Type")).toBe(false);
  });
});
