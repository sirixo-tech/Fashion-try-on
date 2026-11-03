import { expect, it, vi } from "vitest";
import { ApiErrorException } from "../common/api-error.exception.js";
import { AppReleasesService } from "./app-releases.service.js";

function serviceWith(prisma: object, storage: object) {
  const service = Object.create(
    AppReleasesService.prototype,
  ) as AppReleasesService;
  Object.assign(service, { prisma, storage });
  return service;
}

it("dismisses only the creator's failed upload and cleans up its orphaned APK", async () => {
  const upload = {
    findFirst: vi
      .fn()
      .mockResolvedValue({ id: "upload", objectKey: "staged/key" }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const release = { findFirst: vi.fn().mockResolvedValue(null) };
  const storage = { deleteObject: vi.fn().mockResolvedValue(undefined) };
  const service = serviceWith(
    { appReleaseUpload: upload, appRelease: release },
    storage,
  );

  await expect(service.dismissFailedUpload("owner", "upload")).resolves.toEqual(
    {
      dismissed: true,
    },
  );
  expect(upload.findFirst).toHaveBeenCalledWith({
    where: { id: "upload", createdById: "owner", status: "FAILED" },
    select: { id: true, objectKey: true },
  });
  expect(upload.deleteMany).toHaveBeenCalledWith({
    where: { id: "upload", createdById: "owner", status: "FAILED" },
  });
  expect(storage.deleteObject).toHaveBeenCalledWith("staged/key");
});

it("does not dismiss another user's failed upload", async () => {
  const upload = { findFirst: vi.fn().mockResolvedValue(null) };
  const service = serviceWith({ appReleaseUpload: upload }, {});

  await expect(
    service.dismissFailedUpload("other-user", "upload"),
  ).rejects.toBeInstanceOf(ApiErrorException);
});

it("refreshes the upload timestamp when the same APK is uploaded again", async () => {
  const existing = {
    id: "release",
    packageName: "com.selfx.kiosk",
    uploadedAt: new Date("2026-11-02T10:00:00.000Z"),
  };
  const updated = {
    ...existing,
    uploadedAt: new Date("2026-11-03T10:00:00.000Z"),
  };
  const appRelease = {
    findUnique: vi.fn().mockResolvedValue(existing),
    update: vi.fn().mockResolvedValue(updated),
  };
  const service = serviceWith({ appRelease }, {});
  const uploadedAt = new Date("2026-11-03T10:00:00.000Z");
  vi.useFakeTimers();
  vi.setSystemTime(uploadedAt);

  try {
    await expect(
      service.upload(
        "user",
        Buffer.concat([
          Buffer.from([0x50, 0x4b, 0x03, 0x04]),
          Buffer.from("same-apk"),
        ]),
        "",
        "KIOSK",
      ),
    ).resolves.toEqual(updated);
  } finally {
    vi.useRealTimers();
  }

  expect(appRelease.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: "release" },
      data: { uploadedAt, uploadedById: "user" },
      select: expect.any(Object),
    }),
  );
});
