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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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
