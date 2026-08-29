import { HttpStatus } from "@nestjs/common";
import { KioskAssignmentScope } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PublicApiUploadService } from "./public-api-upload.service.js";

describe("PublicApiUploadService", () => {
  it("creates a Store-scoped session and attaches a person image", async () => {
    const storage = new FakeStorage();
    const sessions = new FakeTryOnSessions();
    const service = new PublicApiUploadService(
      storage as never,
      sessions as never,
    );

    const response = await service.uploadImage(credential(), {
      purpose: "PERSON",
      image: uploadImage(),
    });

    expect(storage.putObject).toHaveBeenCalledWith({
      key: expect.stringMatching(
        /^public-api\/store-1\/session-new\/person-[\w-]+\.png$/,
      ),
      contentType: "image/png",
      body: expect.any(Buffer),
    });
    expect(sessions.createSession).toHaveBeenCalledWith({
      assignmentScope: KioskAssignmentScope.ORGANIZATION,
      organizationId: "store-1",
      storeId: null,
      kioskDeviceId: null,
      expiresAt: expect.any(Date),
    });
    expect(sessions.attachPersonAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-new",
        organizationId: "store-1",
        storeId: null,
        kioskDeviceId: null,
        contentType: "image/png",
        sizeBytes: 24,
        width: 320,
        height: 480,
      }),
    );
    expect(response).toMatchObject({
      sessionId: "session-new",
      assetId: "asset-person",
      purpose: "PERSON",
      contentType: "image/png",
      sizeBytes: 24,
      width: 320,
      height: 480,
    });
    expect(response.expiresAt).toEqual("2026-09-04T00:00:00.000Z");
  });

  it("attaches a garment image only to the API key Store session scope", async () => {
    const storage = new FakeStorage();
    const sessions = new FakeTryOnSessions();
    const service = new PublicApiUploadService(
      storage as never,
      sessions as never,
    );

    const response = await service.uploadImage(credential(), {
      purpose: "GARMENT",
      sessionId: "11111111-1111-4111-8111-111111111111",
      image: uploadImage(),
    });

    expect(sessions.createSession).not.toHaveBeenCalled();
    expect(sessions.attachGarmentAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "11111111-1111-4111-8111-111111111111",
        organizationId: "store-1",
        storeId: null,
        kioskDeviceId: null,
      }),
    );
    expect(response).toMatchObject({
      sessionId: "11111111-1111-4111-8111-111111111111",
      assetId: "asset-garment",
      purpose: "GARMENT",
    });
  });

  it("deletes the stored object when session attachment fails", async () => {
    const storage = new FakeStorage();
    const sessions = new FakeTryOnSessions();
    sessions.attachGarmentAsset.mockRejectedValueOnce(
      new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "TRY_ON_SESSION_NOT_FOUND",
        "Try-On session was not found.",
      ),
    );
    const service = new PublicApiUploadService(
      storage as never,
      sessions as never,
    );

    await expect(
      service.uploadImage(credential(), {
        purpose: "GARMENT",
        sessionId: "11111111-1111-4111-8111-111111111111",
        image: uploadImage(),
      }),
    ).rejects.toBeInstanceOf(ApiErrorException);

    expect(storage.deleteObject).toHaveBeenCalledWith(
      expect.stringMatching(
        /^public-api\/store-1\/11111111-1111-4111-8111-111111111111\/garment-[\w-]+\.png$/,
      ),
    );
  });
});

class FakeStorage {
  readonly putObject = vi.fn(async () => undefined);
  readonly deleteObject = vi.fn(async () => undefined);
}

class FakeTryOnSessions {
  readonly createSession = vi.fn(async () => ({
    id: "session-new",
  }));

  readonly attachPersonAsset = vi.fn(async (_input: { expiresAt: Date }) => ({
    id: "asset-person",
    expiresAt: new Date("2026-09-04T00:00:00.000Z"),
  }));

  readonly attachGarmentAsset = vi.fn(async (_input: { expiresAt: Date }) => ({
    id: "asset-garment",
    expiresAt: new Date("2026-09-04T00:00:00.000Z"),
  }));

  readonly completeSession = vi.fn(async () => undefined);
}

function credential() {
  return {
    apiKeyId: "key-1",
    keyPrefix: "selfx_test_abcdefghijkl",
    storeId: "store-1",
    storeName: "Store One",
    environment: "TEST" as const,
    scopes: ["tryon:create" as const],
  };
}

function uploadImage() {
  return {
    fieldName: "image" as const,
    filename: "image.png",
    mimeType: "image/png" as const,
    sizeBytes: 24,
    width: 320,
    height: 480,
    buffer: Buffer.alloc(24),
  };
}
