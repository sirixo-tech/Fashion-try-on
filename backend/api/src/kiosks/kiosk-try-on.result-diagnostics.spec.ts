import { Logger } from "@nestjs/common";
import { KioskAssignmentScope } from "@prisma/client";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import { KioskTryOnService } from "./kiosk-try-on.service.js";

const resultUrl =
  "https://results.example/private.png?token=secret-signed-token";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

afterEach(() => vi.restoreAllMocks());

async function expectInvalidResult(saving: Promise<unknown>): Promise<void> {
  const error = await saving.then(
    () => null,
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(ApiErrorException);
  expect((error as ApiErrorException).getResponse()).toMatchObject({
    error: { message: "Try-On result image is invalid." },
  });
}

function setup() {
  const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  const storage = { putObject: vi.fn().mockResolvedValue(undefined) };
  const sessions = {
    recordLook: vi.fn().mockResolvedValue({
      id: "look-1",
      assignmentScope: KioskAssignmentScope.PLATFORM,
      organizationId: null,
      storeId: null,
    }),
  };
  const service = new KioskTryOnService(
    { kioskTryOnRun: { findUnique: vi.fn().mockResolvedValue(null) } } as never,
    {} as never,
    sessions as never,
    storage as never,
  );
  const image = {
    filename: "fixture.png",
    mimeType: "image/png" as const,
    buffer: png,
    dataUri: `data:image/png;base64,${png.toString("base64")}`,
    sizeBytes: png.length,
    width: 1,
    height: 1,
  };
  const assets = {
    sessionId: "session-1",
    kioskDeviceId: "device-1",
    personAssetId: "person-1",
    jewelleryAssetId: null,
    productId: null,
    personImage: { ...image, fieldName: "personImage" as const },
    jewelleryImage: { ...image, fieldName: "jewelleryImage" as const },
    jewelleryType: "BRACELET" as const,
  };
  return {
    warn,
    log,
    storage,
    save: (url = resultUrl) =>
      service["recordJewellerySessionLook"]("run-1", assets, url),
  };
}

describe("kiosk generated-result download diagnostics", () => {
  it.each([
    ["binary/octet-stream", "png"],
    ["binary/octet-stream", "jpeg"],
    ["binary/octet-stream", "webp"],
    ["application/octet-stream", "png"],
    ["application/octet-stream", "jpeg"],
    ["application/octet-stream", "webp"],
  ] as const)(
    "saves %s results using detected %s format",
    async (contentType, format) => {
      const { save, storage, log, warn } = setup();
      const image = await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#ffffff" },
      })
        .toFormat(format)
        .toBuffer();
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(new Uint8Array(image), {
          headers: { "content-type": contentType },
        }),
      );

      await save();

      expect(storage.putObject).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: `image/${format}`,
          body: image,
        }),
      );
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: "DOWNLOADED",
          contentType,
          detectedMediaType: `image/${format}`,
        }),
      );
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it.each([
    [Buffer.from([0x50, 0x4b, 0x03, 0x04]), "application/zip"],
    [Buffer.from("<html>private error body</html>"), "text/html"],
    [Buffer.from("GIF89a"), "image/gif"],
    [Buffer.alloc(0), "unknown"],
  ])(
    "rejects generic binary results that are not supported images (%s)",
    async (body, detectedMediaType) => {
      const { save, storage, warn } = setup();
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(body, {
          headers: { "content-type": "binary/octet-stream" },
        }),
      );

      await expectInvalidResult(save());

      expect(storage.putObject).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: "INVALID_IMAGE_SIGNATURE",
          detectedMediaType,
        }),
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain(
        "private error body",
      );
    },
  );

  it("still rejects a truncated PNG with a generic binary label", async () => {
    const { save, storage } = setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(png.subarray(0, 8), {
        headers: { "content-type": "binary/octet-stream" },
      }),
    );

    await expect(save()).rejects.toMatchObject({ code: "IMAGE_DECODE_FAILED" });

    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("still rejects a PNG explicitly mislabeled as JPEG", async () => {
    const { save, storage } = setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(png, {
        headers: { "content-type": "image/jpeg" },
      }),
    );

    await expect(save()).rejects.toMatchObject({ code: "IMAGE_TYPE_MISMATCH" });

    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it.each([
    ["not a URL", "INVALID_URL"],
    ["ftp://results.example/result.png", "UNSUPPORTED_SCHEME"],
  ])(
    "logs invalid result URL reason without exposing %s",
    async (url, outcome) => {
      const { save, warn } = setup();
      const fetchMock = vi.spyOn(globalThis, "fetch");

      await expectInvalidResult(save(url));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ outcome }));
      expect(JSON.stringify(warn.mock.calls)).not.toContain(url);
    },
  );

  it("logs successful download metadata without private URLs or image bytes", async () => {
    const { save, log, warn, storage } = setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(png, {
        headers: { "content-type": "image/png" },
      }),
    );

    await save();

    expect(log).toHaveBeenCalledWith({
      event: "kiosk_try_on_result_download",
      runId: "run-1",
      tryOnVertical: "JEWELLERY",
      outcome: "DOWNLOADED",
      httpStatus: 200,
      contentType: "image/png",
      detectedMediaType: "image/png",
      sizeBytes: png.length,
    });
    expect(warn).not.toHaveBeenCalled();
    expect(storage.putObject).toHaveBeenCalledOnce();
    const entries = JSON.stringify(log.mock.calls);
    expect(entries).not.toContain("secret-signed-token");
    expect(entries).not.toContain("results.example");
    expect(entries).not.toContain(png.toString("base64"));
  });

  it.each([
    [
      200,
      "application/zip",
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      "UNSUPPORTED_CONTENT_TYPE",
      "application/zip",
    ],
    [
      403,
      "text/html",
      Buffer.from("<html>private error body</html>"),
      "HTTP_ERROR",
      "text/html",
    ],
    [
      404,
      "text/plain",
      Buffer.from("private error body"),
      "HTTP_ERROR",
      "unknown",
    ],
  ] as const)(
    "logs status %i and %s without changing rejection behavior",
    async (status, contentType, body, outcome, detectedMediaType) => {
      const { save, warn, storage } = setup();
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(body, {
          status,
          headers: { "content-type": contentType },
        }),
      );

      await expectInvalidResult(save());

      expect(warn).toHaveBeenCalledWith({
        event: "kiosk_try_on_result_download",
        runId: "run-1",
        tryOnVertical: "JEWELLERY",
        outcome,
        httpStatus: status,
        contentType,
        detectedMediaType,
      });
      expect(storage.putObject).not.toHaveBeenCalled();
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(
        /secret-signed-token|private error body/,
      );
    },
  );

  it("keeps arbitrary header values out of diagnostics", async () => {
    const { save, warn } = setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(png, {
        headers: {
          "content-type":
            "secret header https://private.example?token=credential",
        },
      }),
    );

    await expectInvalidResult(save());

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "unrecognized",
        detectedMediaType: "image/png",
      }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(
      /secret header|credential|private.example/,
    );
  });

  it("inspects at most 32 bytes and cancels the rejected response stream", async () => {
    const { save, warn } = setup();
    const cancel = vi.fn();
    const read = vi
      .fn()
      .mockResolvedValueOnce({ done: false, value: png.subarray(0, 4) })
      .mockResolvedValueOnce({ done: false, value: png.subarray(4) });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/zip" }),
      body: { getReader: () => ({ read, cancel: async () => cancel() }) },
    } as unknown as Response);

    await expectInvalidResult(save());

    expect(read).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ detectedMediaType: "image/png" }),
    );
  });

  it("bounds signature inspection when the response body stalls", async () => {
    vi.useFakeTimers();
    try {
      const { save, warn } = setup();
      const cancel = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/zip" }),
        body: {
          getReader: () => ({ read: () => new Promise(() => {}), cancel }),
        },
      } as unknown as Response);

      const saving = expectInvalidResult(save());
      await vi.advanceTimersByTimeAsync(1_500);
      await saving;

      expect(cancel).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: "UNSUPPORTED_CONTENT_TYPE",
          detectedMediaType: "unavailable",
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves the original rejection when signature inspection fails", async () => {
    const { save, warn } = setup();
    const body = new ReadableStream({
      start(controller) {
        controller.error(new Error("private stream error"));
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(body, {
        status: 403,
        headers: { "content-type": "text/html" },
      }),
    );

    await expectInvalidResult(save());

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "HTTP_ERROR",
        detectedMediaType: "unavailable",
      }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      "private stream error",
    );
  });

  it("logs network failure without exposing the exception's URL", async () => {
    const { save, warn } = setup();
    const error = new Error(`Connection failed: ${resultUrl}`);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(error);

    await expect(save()).rejects.toBe(error);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "DOWNLOAD_FAILED" }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      "secret-signed-token",
    );
  });

  it("logs body-read failure without exposing the exception", async () => {
    const { save, warn } = setup();
    const error = new Error(`Read failed: ${resultUrl}`);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: async () => {
        throw error;
      },
    } as unknown as Response);

    await expect(save()).rejects.toBe(error);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "BODY_READ_FAILED" }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      "secret-signed-token",
    );
  });
});
