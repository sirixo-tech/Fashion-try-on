import { HttpStatus } from "@nestjs/common";
import {
  KioskAssignmentScope,
  KioskConfigurationAssetType,
  KioskConfigurationGarmentIntent,
  KioskConfigurationSoundProfile,
  KioskDeviceStatus,
  KioskIdleMode,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import {
  AdminKioskConfigurationController,
  KioskConfigurationController,
} from "./kiosk-configuration.controller.js";
import { KIOSK_ERROR_CODES } from "./kiosk.constants.js";
import { KioskConfigurationService } from "./kiosk-configuration.service.js";
import { mapDevice } from "./kiosk.service.js";
import { type UpdateKioskConfigurationDto } from "./dto/kiosk.dto.js";

describe("KIOSK-6A remote kiosk configuration", () => {
  it("returns predictable bundled defaults when no saved configuration exists", async () => {
    const harness = new ConfigurationHarness();

    const configuration = await harness.service.getAdminConfiguration(
      harness.deviceId,
    );

    expect(configuration.version).toBe(1);
    expect(configuration.display.idleMode).toBe(KioskIdleMode.STATIC);
    expect(configuration.display.assets[0]?.type).toBe(
      KioskConfigurationAssetType.BUNDLED_IMAGE,
    );
    expect(configuration.display.assets[0]?.bundledAssetKey).toBe(
      "selfx-default-kiosk-video",
    );
    expect(configuration.experience.enabledGarmentIntents).toEqual([
      KioskConfigurationGarmentIntent.TOP,
      KioskConfigurationGarmentIntent.BOTTOM,
      KioskConfigurationGarmentIntent.FULL_OUTFIT,
    ]);
  });

  it("lets a superadmin read and update kiosk configuration", async () => {
    const service = {
      getAdminConfiguration: vi.fn().mockResolvedValue({ version: 4 }),
      updateAdminConfiguration: vi.fn().mockResolvedValue({ version: 5 }),
    };
    const platformAuthorization = {
      requirePermission: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new AdminKioskConfigurationController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "super-user" }),
      } as never,
      platformAuthorization as never,
      service as never,
    );
    const request = {
      headers: { authorization: "Bearer staff" },
    };

    await expect(
      controller.get(request as never, "01a0006a-0000-7000-8000-000000000001"),
    ).resolves.toEqual({ version: 4 });
    await expect(
      controller.update(
        request as never,
        "01a0006a-0000-7000-8000-000000000001",
        configurationInput(),
      ),
    ).resolves.toEqual({ version: 5 });

    expect(platformAuthorization.requirePermission).toHaveBeenCalledWith(
      "super-user",
      PLATFORM_PERMISSIONS.kiosksConfigure,
    );
    expect(service.updateAdminConfiguration).toHaveBeenCalledWith(
      "super-user",
      "01a0006a-0000-7000-8000-000000000001",
      configurationInput(),
    );
  });

  it("rejects non-superadmin configuration updates through platform authorization", async () => {
    const service = { updateAdminConfiguration: vi.fn() };
    const controller = new AdminKioskConfigurationController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "support-user" }),
      } as never,
      {
        requirePermission: vi
          .fn()
          .mockRejectedValue(
            new ApiErrorException(
              HttpStatus.FORBIDDEN,
              "PLATFORM_PERMISSION_DENIED",
              "Platform permission denied.",
            ),
          ),
      } as never,
      service as never,
    );

    await expectApiCode(
      controller.update(
        { headers: { authorization: "Bearer support" } } as never,
        "01a0006a-0000-7000-8000-000000000001",
        configurationInput(),
      ),
      "PLATFORM_PERMISSION_DENIED",
    );
    expect(service.updateAdminConfiguration).not.toHaveBeenCalled();
  });

  it("lets an active paired kiosk fetch only its own effective configuration", async () => {
    const harness = new ConfigurationHarness();
    await harness.service.updateAdminConfiguration(
      harness.actorUserId,
      harness.deviceId,
      configurationInput({ ctaLabel: "Begin" }),
    );

    const own = await harness.service.getDeviceConfiguration("Bearer own");

    expect(own.version).toBe(2);
    expect(own.display.ctaLabel).toBe("Begin");

    harness.authenticatedDeviceId = harness.otherDeviceId;
    const other = await harness.service.getDeviceConfiguration("Bearer other");
    expect(other.version).toBe(1);
    expect(other.display.ctaLabel).toBe("Start Try-On");
  });

  it("rejects revoked or inactive kiosk configuration fetches", async () => {
    const harness = new ConfigurationHarness();
    const controller = new KioskConfigurationController(harness.service);

    harness.deviceAuthError = new ApiErrorException(
      HttpStatus.FORBIDDEN,
      KIOSK_ERROR_CODES.deviceInactive,
      "Kiosk device is inactive.",
    );
    await expectApiCode(
      controller.get("Bearer inactive"),
      KIOSK_ERROR_CODES.deviceInactive,
    );

    harness.deviceAuthError = new ApiErrorException(
      HttpStatus.FORBIDDEN,
      KIOSK_ERROR_CODES.deviceRevoked,
      "Kiosk device has been revoked.",
    );
    await expectApiCode(
      controller.get("Bearer revoked"),
      KIOSK_ERROR_CODES.deviceRevoked,
    );
  });

  it("increments the version on each accepted update", async () => {
    const harness = new ConfigurationHarness();

    const first = await harness.service.updateAdminConfiguration(
      harness.actorUserId,
      harness.deviceId,
      configurationInput({ ctaLabel: "Begin" }),
    );
    const second = await harness.service.updateAdminConfiguration(
      harness.actorUserId,
      harness.deviceId,
      configurationInput({ ctaLabel: "Start" }),
    );

    expect(first.version).toBe(2);
    expect(second.version).toBe(3);
  });

  it("rejects invalid slide durations and invalid garment intents", async () => {
    const harness = new ConfigurationHarness();

    await expectApiCode(
      harness.service.updateAdminConfiguration(
        harness.actorUserId,
        harness.deviceId,
        configurationInput({ slideDurationSeconds: 2 }),
      ),
      KIOSK_ERROR_CODES.configurationInvalid,
    );

    await expectApiCode(
      harness.service.updateAdminConfiguration(
        harness.actorUserId,
        harness.deviceId,
        configurationInput({
          enabledGarmentIntents: ["SHOES" as KioskConfigurationGarmentIntent],
        }),
      ),
      KIOSK_ERROR_CODES.configurationInvalid,
    );
  });

  it("creates upload intents for kiosk presentation videos", async () => {
    const harness = new ConfigurationHarness();

    const intent = await harness.service.createAdminAssetUploadIntent(
      harness.deviceId,
      {
        contentType: "video/mp4",
        sizeBytes: 4 * 1024 * 1024,
        fileName: "launch-loop.mp4",
      },
    );

    expect(intent.type).toBe(KioskConfigurationAssetType.UPLOADED_IMAGE);
    expect(intent.label).toBe("launch-loop");
    expect(intent.maxImageBytes).toBe(12 * 1024 * 1024);
    expect(intent.maxVideoBytes).toBe(80 * 1024 * 1024);
    expect(intent.supportedContentTypes).toContain("video/mp4");
    expect(harness.storage.createUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "video/mp4" }),
    );
  });

  it("rejects dangerous presentation asset references", async () => {
    const harness = new ConfigurationHarness();
    const unsafeUrls = [
      "file:///tmp/image.png",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "http://assets.selfx.test/image.png",
      "https://localhost/image.png",
      "https://127.0.0.1/image.png",
      "https://10.0.0.1/image.png",
      "https://100.64.0.1/image.png",
      "https://172.16.0.4/image.png",
      "https://192.168.1.9/image.png",
      "https://[::1]/image.png",
      "https://[::ffff:127.0.0.1]/image.png",
      "https://assets.internal/image.png",
      "https://screen.local/image.png",
    ];

    for (const url of unsafeUrls) {
      await expectApiCode(
        harness.service.updateAdminConfiguration(
          harness.actorUserId,
          harness.deviceId,
          configurationInput({ assetUrl: url }),
        ),
        KIOSK_ERROR_CODES.configurationInvalid,
      );
    }
  });

  it("exposes latestConfigurationVersion on session and heartbeat device responses", () => {
    const device = deviceRecord({ configuration: { version: 9 } });
    const withoutSavedConfiguration = deviceRecord({ configuration: null });

    expect(mapDevice(device).latestConfigurationVersion).toBe(9);
    expect(
      mapDevice(withoutSavedConfiguration).latestConfigurationVersion,
    ).toBe(1);
  });
});

class ConfigurationHarness {
  readonly deviceId = "01a0006a-0000-7000-8000-000000000001";
  readonly otherDeviceId = "01a0006a-0000-7000-8000-000000000003";
  readonly actorUserId = "01a0006a-0000-7000-8000-000000000002";
  readonly auditLogs: Array<{ action: string }> = [];
  authenticatedDeviceId = this.deviceId;
  deviceAuthError: ApiErrorException | null = null;
  readonly storage = {
    createUploadUrl: vi.fn(
      ({ key }: { key: string }) => `https://storage.test/${key}`,
    ),
    createReadUrl: vi.fn(
      ({ key }: { key: string }) => `https://storage.test/${key}`,
    ),
  };
  private readonly assetsByConfigurationId = new Map<
    string,
    Array<Record<string, unknown>>
  >();
  private readonly configurationsByDeviceId = new Map<
    string,
    Record<string, unknown>
  >();

  readonly prisma = {
    kioskDevice: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        this.device(where.id),
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const device = this.device(where.id);
        if (!device) {
          throw new Error("Device not found");
        }
        return device;
      },
    },
    kioskDeviceConfiguration: {
      findUnique: async ({
        where,
      }: {
        where: { kioskDeviceId?: string; id?: string };
      }) => {
        const configuration = where.id
          ? [...this.configurationsByDeviceId.values()].find(
              (item) => item.id === where.id,
            )
          : this.configurationsByDeviceId.get(where.kioskDeviceId ?? "");
        return configuration
          ? this.configurationWithAssets(configuration)
          : null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const configuration = {
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.configurationsByDeviceId.set(
          String(data.kioskDeviceId),
          configuration,
        );
        return configuration;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const entry = [...this.configurationsByDeviceId.entries()].find(
          ([, configuration]) => configuration.id === where.id,
        );
        if (!entry) {
          throw new Error("Configuration not found");
        }
        const [deviceId, configuration] = entry;
        const updated = {
          ...configuration,
          ...data,
          updatedAt: new Date(),
        };
        this.configurationsByDeviceId.set(deviceId, updated);
        return updated;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const configuration = [...this.configurationsByDeviceId.values()].find(
          (item) => item.id === where.id,
        );
        if (!configuration) {
          throw new Error("Configuration not found");
        }
        return this.configurationWithAssets(configuration);
      },
    },
    kioskDeviceConfigurationAsset: {
      deleteMany: async ({ where }: { where: { configurationId: string } }) => {
        this.assetsByConfigurationId.set(where.configurationId, []);
      },
      createMany: async ({
        data,
      }: {
        data: Array<Record<string, unknown>>;
      }) => {
        for (const asset of data) {
          const configurationId = String(asset.configurationId);
          const current =
            this.assetsByConfigurationId.get(configurationId) ?? [];
          current.push({ ...asset, createdAt: new Date() });
          this.assetsByConfigurationId.set(configurationId, current);
        }
      },
    },
    auditLog: {
      create: async ({ data }: { data: { action: string } }) => {
        this.auditLogs.push({ action: data.action });
      },
    },
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
      callback(this.prisma),
  };

  readonly service = new KioskConfigurationService(
    this.prisma as never,
    {
      requireDevice: async () => {
        if (this.deviceAuthError) {
          throw this.deviceAuthError;
        }
        return { id: this.authenticatedDeviceId };
      },
    } as never,
    this.storage as never,
    {
      resolveGarmentPreviewEnabled: async () => false,
    } as never,
  );

  private device(id: string): Record<string, unknown> | null {
    if (![this.deviceId, this.otherDeviceId].includes(id)) {
      return null;
    }
    return {
      id,
      status: KioskDeviceStatus.ACTIVE,
      assignmentScope: KioskAssignmentScope.PLATFORM,
      organizationId: null,
      storeId: null,
    };
  }

  private configurationWithAssets(
    configuration: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      ...configuration,
      assets: this.assetsByConfigurationId.get(String(configuration.id)) ?? [],
    };
  }
}

function configurationInput(
  overrides: {
    ctaLabel?: string;
    slideDurationSeconds?: number;
    enabledGarmentIntents?: KioskConfigurationGarmentIntent[];
    assetUrl?: string;
  } = {},
): UpdateKioskConfigurationDto {
  return {
    display: {
      idleMode: KioskIdleMode.STATIC,
      slideDurationSeconds: overrides.slideDurationSeconds ?? 8,
      title: "SelfX Studio",
      subtitle: "Try the new collection",
      ctaLabel: overrides.ctaLabel ?? "Begin",
      assets: [
        {
          type: overrides.assetUrl
            ? KioskConfigurationAssetType.REMOTE_IMAGE
            : KioskConfigurationAssetType.BUNDLED_IMAGE,
          label: "Launch image",
          url: overrides.assetUrl,
          bundledAssetKey: overrides.assetUrl
            ? undefined
            : "selfx-default-kiosk-wallpaper",
        },
      ],
    },
    capture: {
      countdownSeconds: 15,
      soundEnabled: true,
      soundProfile: KioskConfigurationSoundProfile.STUDIO,
      guidanceAudioEnabled: true,
    },
    experience: {
      enabledGarmentIntents: overrides.enabledGarmentIntents ?? [
        KioskConfigurationGarmentIntent.TOP,
      ],
      sessionIdleTimeoutSeconds: 180,
    },
  };
}

function deviceRecord({
  configuration,
}: {
  configuration: { version: number } | null;
}) {
  const now = new Date("2026-08-16T00:00:00.000Z");
  return {
    id: "01a0006a-0000-7000-8000-000000000001",
    displayName: "SelfX Kiosk",
    status: KioskDeviceStatus.ACTIVE,
    assignmentScope: KioskAssignmentScope.PLATFORM,
    organizationId: null,
    organization: null,
    storeId: null,
    store: null,
    platform: "windows",
    appVersion: "1.0.0",
    installationId: "install-1",
    pairedAt: now,
    lastSeenAt: now,
    inactiveAt: null,
    revokedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    configuration,
  };
}

async function expectApiCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (caught) {
    expect(caught).toBeInstanceOf(ApiErrorException);
    const response = (caught as ApiErrorException).getResponse();
    const body = response as { error?: { code?: string } };
    expect(body.error?.code).toBe(code);
  }
}
