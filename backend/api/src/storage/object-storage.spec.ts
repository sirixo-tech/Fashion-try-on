import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ObjectStorageService } from "./object-storage.js";

describe("ObjectStorageService", () => {
  beforeEach(() => {
    vi.stubEnv("OBJECT_STORAGE_ENDPOINT", "https://storage.selfx.test");
    vi.stubEnv("OBJECT_STORAGE_REGION", "auto");
    vi.stubEnv("OBJECT_STORAGE_BUCKET", "selfx-assets");
    vi.stubEnv("OBJECT_STORAGE_ACCESS_KEY_ID", "access-key");
    vi.stubEnv("OBJECT_STORAGE_SECRET_ACCESS_KEY", "secret-key");
    vi.stubEnv("OBJECT_STORAGE_URL_STYLE", "virtual");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });


  it("signs virtual-host URLs by default for reads and writes", () => {
    vi.stubEnv("OBJECT_STORAGE_URL_STYLE", "");
    const storage = new ObjectStorageService();
    const readUrl = new URL(
      storage.createReadUrl({
        key: "try-on/garment image.jpg",
        expiresInSeconds: 60,
      }),
    );
    const uploadUrl = new URL(
      storage.createUploadUrl({
        key: "try-on/garment image.jpg",
        contentType: "image/jpeg",
        expiresInSeconds: 60,
      }),
    );

    for (const url of [readUrl, uploadUrl]) {
      expect(url.hostname).toBe("selfx-assets.storage.selfx.test");
      expect(url.pathname).toBe("/try-on/garment%20image.jpg");
      expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(readUrl.searchParams.get("X-Amz-Signature")).not.toBe(
      uploadUrl.searchParams.get("X-Amz-Signature"),
    );
  });

  it("supports explicitly configured path-style buckets", () => {
    vi.stubEnv("OBJECT_STORAGE_URL_STYLE", "path");
    const url = new URL(
      new ObjectStorageService().createReadUrl({
        key: "try-on/garment.jpg",
        expiresInSeconds: 60,
      }),
    );
    expect(url.hostname).toBe("storage.selfx.test");
    expect(url.pathname).toBe("/selfx-assets/try-on/garment.jpg");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects unsupported URL styles instead of signing a wrong host", () => {
    vi.stubEnv("OBJECT_STORAGE_URL_STYLE", "unsupported");
    try {
      new ObjectStorageService().createReadUrl({
        key: "try-on/garment.jpg",
        expiresInSeconds: 60,
      });
      expect.fail("Expected invalid storage configuration to be rejected.");
    } catch (error) {
      expect(error).toMatchObject({
        status: 503,
        response: {
          error: { code: "OBJECT_STORAGE_INVALID_CONFIGURATION" },
        },
      });
    }
  });

  it("logs write rejection metadata without keys, signed URLs or response bodies", async () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("secret-body", { status: 403 })),
    );
    await expect(
      new ObjectStorageService().putObject({
        key: "private-photo.png",
        contentType: "image/png",
        body: Buffer.from("private-image"),
      }),
    ).rejects.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "object_storage_write_failure",
        outcome: "HTTP_REJECTED",
        httpStatus: 403,
        sizeBytes: 13,
      }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(
      /private|secret|https|Signature/,
    );
  });

  it("logs transport failures without exception messages", async () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    const error = new Error("secret signed URL");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
    await expect(
      new ObjectStorageService().putObject({
        key: "private-photo.png",
        contentType: "image/png",
        body: Buffer.from("image"),
      }),
    ).rejects.toBe(error);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "TRANSPORT_ERROR" }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret");
  });
  it("adds response content disposition overrides to signed read URLs", () => {
    vi.stubEnv("OBJECT_STORAGE_ENDPOINT", "https://storage.selfx.test");
    vi.stubEnv("OBJECT_STORAGE_REGION", "auto");
    vi.stubEnv("OBJECT_STORAGE_BUCKET", "selfx-assets");
    vi.stubEnv("OBJECT_STORAGE_ACCESS_KEY_ID", "access-key");
    vi.stubEnv("OBJECT_STORAGE_SECRET_ACCESS_KEY", "secret-key");

    const storage = new ObjectStorageService();
    const url = new URL(
      storage.createReadUrl({
        key: "try-on/results/look.jpg",
        expiresInSeconds: 300,
        responseContentDisposition:
          "attachment; filename=\"selfx-look.jpg\"; filename*=UTF-8''selfx-look.jpg",
        responseContentType: "image/jpeg",
      }),
    );

    expect(url.searchParams.get("response-content-disposition")).toBe(
      "attachment; filename=\"selfx-look.jpg\"; filename*=UTF-8''selfx-look.jpg",
    );
    expect(url.searchParams.get("response-content-type")).toBe("image/jpeg");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });
});
