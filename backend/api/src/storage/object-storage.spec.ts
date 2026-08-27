import { describe, expect, it, vi } from "vitest";

import { ObjectStorageService } from "./object-storage.js";

describe("ObjectStorageService", () => {
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
          'attachment; filename="selfx-look.jpg"; filename*=UTF-8\'\'selfx-look.jpg',
        responseContentType: "image/jpeg",
      }),
    );

    expect(url.searchParams.get("response-content-disposition")).toBe(
      'attachment; filename="selfx-look.jpg"; filename*=UTF-8\'\'selfx-look.jpg',
    );
    expect(url.searchParams.get("response-content-type")).toBe("image/jpeg");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });
});
