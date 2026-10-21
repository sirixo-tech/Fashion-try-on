import "reflect-metadata";
import { beforeEach, expect, it, vi } from "vitest";
import {
  AppReleasesController,
  StoreAppDownloadsController,
} from "./app-releases.controller.js";
const auth = { requireAccessUser: vi.fn() },
  platform = { hasPermission: vi.fn(), requirePermission: vi.fn() },
  releases = {
    list: vi.fn(),
    download: vi.fn(),
    beginUpload: vi.fn(),
    change: vi.fn(),
  },
  rbac = {
    requireStoreResourcePermission: vi.fn(),
    effectivePermissions: vi.fn(),
  },
  impersonation = { resolveStoreContext: vi.fn() };
const request = { headers: { authorization: "Bearer fixture" } };
beforeEach(() => {
  vi.resetAllMocks();
  auth.requireAccessUser.mockResolvedValue({ id: "user" });
  platform.hasPermission.mockResolvedValue(false);
  rbac.effectivePermissions.mockResolvedValue({
    featureKeys: ["KIOSK_MANAGEMENT"],
  });
});
it("rejects platform upload before reading a merchant's multipart body", async () => {
  platform.requirePermission.mockRejectedValue(new Error("denied"));
  const controller = new AppReleasesController(
    auth as never,
    platform as never,
    releases as never,
  );
  await expect(controller.upload(request as never)).rejects.toThrow("denied");
  expect(releases.beginUpload).not.toHaveBeenCalled();
});
it("requires release management independently of viewing", async () => {
  platform.hasPermission.mockResolvedValue(true);
  platform.requirePermission.mockRejectedValue(new Error("view only"));
  const controller = new AppReleasesController(
    auth as never,
    platform as never,
    releases as never,
  );
  await expect(
    controller.action(request as never, "release", {
      action: "publish",
      revision: 0,
    }),
  ).rejects.toThrow();
  expect(releases.change).not.toHaveBeenCalled();
});
it("validates Store scope and permission before fetching a download", async () => {
  rbac.requireStoreResourcePermission.mockRejectedValue(
    new Error("wrong Store"),
  );
  const controller = new StoreAppDownloadsController(
    auth as never,
    rbac as never,
    impersonation as never,
    releases as never,
  );
  await expect(
    controller.download(request as never, "other-store", "release"),
  ).rejects.toThrow();
  expect(releases.download).not.toHaveBeenCalled();
});
it("requires a kiosk plan even with Store permission", async () => {
  rbac.effectivePermissions.mockResolvedValue({ featureKeys: [] });
  const controller = new StoreAppDownloadsController(
    auth as never,
    rbac as never,
    impersonation as never,
    releases as never,
  );
  await expect(
    controller.list(request as never, "store", {}),
  ).rejects.toThrow();
  expect(releases.list).not.toHaveBeenCalled();
});
it("restricts Store listings and downloads to published releases", async () => {
  const controller = new StoreAppDownloadsController(
    auth as never,
    rbac as never,
    impersonation as never,
    releases as never,
  );
  await controller.list(request as never, "store", {});
  await controller.download(request as never, "store", "release");
  expect(releases.list).toHaveBeenCalledWith(true, undefined, undefined);
  expect(releases.download).toHaveBeenCalledWith("release", true);
  expect(rbac.requireStoreResourcePermission).toHaveBeenCalledWith(
    "user",
    "store",
    "kiosks.view",
  );
});
