import {
  KioskAssignmentScope,
  TryOnAssetPurpose,
  TryOnSessionStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import { TryOnSessionService } from "./try-on-session.service.js";

describe("TryOnSessionService", () => {
  it("keeps older runs linked to the person asset they were created with", async () => {
    const prisma = new FakePrisma();
    const service = new TryOnSessionService(prisma as never);
    prisma.seedRun({ id: "run-1", kioskDeviceId: "kiosk-1" });
    prisma.seedRun({ id: "run-2", kioskDeviceId: "kiosk-1" });

    const session = await service.createSession(kioskContext());
    const personA = await service.attachPersonAsset({
      sessionId: session.id,
      kioskDeviceId: "kiosk-1",
      storageKey: "try-on/person-a.jpg",
    });
    const garmentA = await service.attachGarmentAsset({
      sessionId: session.id,
      kioskDeviceId: "kiosk-1",
      storageKey: "try-on/garment-a.jpg",
    });
    await service.recordRun({
      sessionId: session.id,
      kioskDeviceId: "kiosk-1",
      kioskTryOnRunId: "run-1",
      personAssetId: personA.id,
      garmentAssetId: garmentA.id,
    });

    const personB = await service.attachPersonAsset({
      sessionId: session.id,
      kioskDeviceId: "kiosk-1",
      storageKey: "try-on/person-b.jpg",
    });
    const garmentB = await service.attachGarmentAsset({
      sessionId: session.id,
      kioskDeviceId: "kiosk-1",
      storageKey: "try-on/garment-b.jpg",
    });
    await service.recordRun({
      sessionId: session.id,
      kioskDeviceId: "kiosk-1",
      kioskTryOnRunId: "run-2",
      personAssetId: personB.id,
      garmentAssetId: garmentB.id,
    });

    expect(prisma.runs.get("run-1")).toMatchObject({
      tryOnSessionId: session.id,
      personAssetId: personA.id,
      garmentAssetId: garmentA.id,
    });
    expect(prisma.runs.get("run-2")).toMatchObject({
      tryOnSessionId: session.id,
      personAssetId: personB.id,
      garmentAssetId: garmentB.id,
    });
    expect(prisma.sessions.get(session.id)?.currentPersonAssetId).toBe(
      personB.id,
    );
  });

  it("creates looks only from completed runs", async () => {
    const prisma = new FakePrisma();
    const service = new TryOnSessionService(prisma as never);
    const session = await service.createSession(kioskContext());
    const person = await service.attachPersonAsset({
      sessionId: session.id,
      kioskDeviceId: "kiosk-1",
      storageKey: "try-on/person.jpg",
    });
    const garment = await service.attachGarmentAsset({
      sessionId: session.id,
      kioskDeviceId: "kiosk-1",
      storageKey: "try-on/garment.jpg",
    });
    prisma.seedRun({
      id: "failed-run",
      kioskDeviceId: "kiosk-1",
      status: "FAILED",
      tryOnSessionId: session.id,
    });

    await expect(
      service.recordLook({
        sessionId: session.id,
        kioskDeviceId: "kiosk-1",
        kioskTryOnRunId: "failed-run",
        personAssetId: person.id,
        garmentAssetId: garment.id,
        resultAsset: { storageKey: "try-on/result-failed.png" },
      }),
    ).rejects.toBeInstanceOf(ApiErrorException);

    prisma.seedRun({
      id: "completed-run",
      kioskDeviceId: "kiosk-1",
      status: "COMPLETED",
      tryOnSessionId: session.id,
    });
    const look = await service.recordLook({
      sessionId: session.id,
      kioskDeviceId: "kiosk-1",
      kioskTryOnRunId: "completed-run",
      personAssetId: person.id,
      garmentAssetId: garment.id,
      resultAsset: { storageKey: "try-on/result.png" },
    });

    expect(look).toMatchObject({
      sessionId: session.id,
      kioskTryOnRunId: "completed-run",
      personAssetId: person.id,
      garmentAssetId: garment.id,
    });
    expect(prisma.assets.get(look.resultAssetId)).toMatchObject({
      purpose: TryOnAssetPurpose.RESULT,
      storageKey: "try-on/result.png",
    });
  });

  it("revokes active share links when a session is completed", async () => {
    const prisma = new FakePrisma();
    const storage = new FakeStorage();
    const service = new TryOnSessionService(prisma as never, storage as never);
    const session = await service.createSession(kioskContext());
    const person = await service.attachPersonAsset({
      sessionId: session.id,
      kioskDeviceId: "kiosk-1",
      storageKey: "try-on/person.jpg",
    });
    const result = await service.attachGarmentAsset({
      sessionId: session.id,
      kioskDeviceId: "kiosk-1",
      storageKey: "try-on/result.jpg",
    });
    prisma.seedRun({
      id: "run-1",
      kioskDeviceId: "kiosk-1",
      tryOnSessionId: session.id,
      personAssetId: person.id,
      resultAssetId: result.id,
      resultImage: "data:image/jpeg;base64,cmVzdWx0",
    });
    prisma.seedShare({
      id: "share-1",
      sessionId: session.id,
      revokedAt: null,
    });

    await service.completeSession({
      sessionId: session.id,
      kioskDeviceId: "kiosk-1",
    });

    expect(prisma.sessions.get(session.id)).toMatchObject({
      status: TryOnSessionStatus.COMPLETED,
    });
    expect(prisma.shareCapabilities.get("share-1")?.revokedAt).toBeInstanceOf(
      Date,
    );
    expect(prisma.sessions.get(session.id)?.currentPersonAssetId).toBeNull();
    expect(prisma.runs.get("run-1")?.resultImage).toBeNull();
    expect(prisma.assets.get(person.id)?.deletedAt).toBeInstanceOf(Date);
    expect(prisma.assets.get(result.id)?.deletedAt).toBeInstanceOf(Date);
    expect(storage.deletedKeys).toEqual([
      "try-on/person.jpg",
      "try-on/result.jpg",
    ]);
  });
});

function kioskContext() {
  return {
    assignmentScope: KioskAssignmentScope.ORGANIZATION,
    organizationId: "org-1",
    storeId: null,
    kioskDeviceId: "kiosk-1",
  };
}

class FakePrisma {
  readonly sessions = new Map<string, FakeSession>();
  readonly assets = new Map<string, FakeAsset>();
  readonly runs = new Map<string, FakeRun>();
  readonly looks = new Map<string, FakeLook>();
  readonly shareCapabilities = new Map<string, FakeShare>();

  readonly $transaction = vi.fn(async (callback: (tx: this) => unknown) =>
    callback(this),
  );

  readonly tryOnSession = {
    create: vi.fn(async ({ data }: { data: CreateSessionData }) => {
      const now = new Date();
      const session: FakeSession = {
        ...data,
        currentPersonAssetId: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.sessions.set(session.id, session);
      return session;
    }),
    findFirst: vi.fn(async ({ where }: { where: SessionWhere }) => {
      return (
        [...this.sessions.values()].find((session) =>
          matchesSession(session, where),
        ) ?? null
      );
    }),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeSession>;
      }) => {
        const session = this.sessions.get(where.id);
        if (!session) {
          throw new Error("session not found");
        }
        Object.assign(session, data, { updatedAt: new Date() });
        return session;
      },
    ),
    updateMany: vi.fn(
      async ({ where, data }: { where: SessionWhere; data: Partial<FakeSession> }) => {
        const matches = [...this.sessions.values()].filter((session) =>
          matchesSession(session, where),
        );
        for (const session of matches) {
          Object.assign(session, data, { updatedAt: new Date() });
        }
        return { count: matches.length };
      },
    ),
    findFirstOrThrow: vi.fn(async ({ where }: { where: SessionWhere }) => {
      const session =
        [...this.sessions.values()].find((item) => matchesSession(item, where)) ??
        null;
      if (!session) {
        throw new Error("session not found");
      }
      return session;
    }),
  };

  readonly tryOnAsset = {
    create: vi.fn(async ({ data }: { data: CreateAssetData }) => {
      const now = new Date();
      const asset: FakeAsset = {
        ...data,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.assets.set(asset.id, asset);
      return asset;
    }),
    findFirst: vi.fn(async ({ where }: { where: AssetWhere }) => {
      return (
        [...this.assets.values()].find(
          (asset) =>
            asset.id === where.id &&
            asset.sessionId === where.sessionId &&
            asset.purpose === where.purpose &&
            asset.deletedAt === where.deletedAt,
        ) ?? null
      );
    }),
    findMany: vi.fn(async ({ where }: { where: AssetManyWhere }) => {
      return [...this.assets.values()]
        .filter((asset) => matchesAssetMany(asset, where))
        .map((asset) => ({ storageKey: asset.storageKey }));
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: AssetManyWhere;
        data: Partial<FakeAsset>;
      }) => {
        const matches = [...this.assets.values()].filter((asset) =>
          matchesAssetMany(asset, where),
        );
        for (const asset of matches) {
          Object.assign(asset, data, { updatedAt: new Date() });
        }
        return { count: matches.length };
      },
    ),
  };

  readonly kioskTryOnRun = {
    updateMany: vi.fn(
      async ({ where, data }: { where: RunWhere; data: Partial<FakeRun> }) => {
        const matches = [...this.runs.values()].filter((run) =>
          matchesRun(run, where),
        );
        for (const run of matches) {
          Object.assign(run, data, { updatedAt: new Date() });
        }
        return { count: matches.length };
      },
    ),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
      const run = this.runs.get(where.id);
      if (!run) {
        throw new Error("run not found");
      }
      return run;
    }),
    findFirst: vi.fn(async ({ where }: { where: RunWhere }) => {
      return [...this.runs.values()].find((run) => matchesRun(run, where)) ?? null;
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Partial<FakeRun> }) => {
        const run = this.runs.get(where.id);
        if (!run) {
          throw new Error("run not found");
        }
        Object.assign(run, data, { updatedAt: new Date() });
        return run;
      },
    ),
  };

  readonly tryOnLook = {
    findUnique: vi.fn(async ({ where }: { where: { kioskTryOnRunId: string } }) => {
      return (
        [...this.looks.values()].find(
          (look) => look.kioskTryOnRunId === where.kioskTryOnRunId,
        ) ?? null
      );
    }),
    create: vi.fn(async ({ data }: { data: CreateLookData }) => {
      const now = new Date();
      const look: FakeLook = { ...data, createdAt: now, updatedAt: now };
      this.looks.set(look.id, look);
      return look;
    }),
    findMany: vi.fn(async ({ where }: { where: { sessionId: string } }) =>
      [...this.looks.values()].filter((look) => look.sessionId === where.sessionId),
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: LookManyWhere;
        data: Partial<FakeLook>;
      }) => {
        const matches = [...this.looks.values()].filter((look) =>
          matchesLookMany(look, where),
        );
        for (const look of matches) {
          Object.assign(look, data, { updatedAt: new Date() });
        }
        return { count: matches.length };
      },
    ),
  };

  readonly tryOnShareCapability = {
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: ShareWhere;
        data: Partial<FakeShare>;
      }) => {
        const matches = [...this.shareCapabilities.values()].filter((share) =>
          matchesShare(share, where),
        );
        for (const share of matches) {
          Object.assign(share, data);
        }
        return { count: matches.length };
      },
    ),
  };

  seedRun(input: Partial<FakeRun> & { id: string; kioskDeviceId: string }): void {
    const now = new Date();
    this.runs.set(input.id, {
      status: "QUEUED",
      tryOnSessionId: null,
      personAssetId: null,
      garmentAssetId: null,
      resultAssetId: null,
      resultImage: null,
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
      ...input,
    });
  }

  seedShare(input: Partial<FakeShare> & { id: string; sessionId: string }): void {
    const now = new Date();
    this.shareCapabilities.set(input.id, {
      capabilityDigest: "digest",
      assignmentScope: KioskAssignmentScope.ORGANIZATION,
      organizationId: "org-1",
      storeId: null,
      kioskDeviceId: "kiosk-1",
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      revokedAt: null,
      ...input,
    });
  }
}

interface CreateSessionData {
  id: string;
  status: TryOnSessionStatus;
  assignmentScope: KioskAssignmentScope;
  organizationId: string | null;
  storeId: string | null;
  kioskDeviceId: string | null;
  expiresAt: Date;
}

type FakeSession = CreateSessionData & {
  currentPersonAssetId: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

interface CreateAssetData {
  id: string;
  sessionId: string;
  purpose: TryOnAssetPurpose;
  assignmentScope: KioskAssignmentScope;
  organizationId: string | null;
  storeId: string | null;
  kioskDeviceId: string | null;
  storageKey: string;
  contentType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  expiresAt: Date;
}

type FakeAsset = CreateAssetData & {
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

interface FakeRun {
  id: string;
  kioskDeviceId: string;
  status: string;
  tryOnSessionId: string | null;
  personAssetId: string | null;
  garmentAssetId: string | null;
  resultAssetId: string | null;
  resultImage: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateLookData {
  id: string;
  sessionId: string;
  kioskTryOnRunId: string;
  personAssetId: string;
  garmentAssetId: string | null;
  resultAssetId: string;
  assignmentScope: KioskAssignmentScope;
  organizationId: string | null;
  storeId: string | null;
  kioskDeviceId: string | null;
  expiresAt: Date;
}

type FakeLook = CreateLookData & {
  createdAt: Date;
  updatedAt: Date;
};

interface FakeShare {
  id: string;
  sessionId: string;
  capabilityDigest: string;
  assignmentScope: KioskAssignmentScope;
  organizationId: string | null;
  storeId: string | null;
  kioskDeviceId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
}

interface SessionWhere {
  id: string;
  kioskDeviceId?: string | null;
  status?: TryOnSessionStatus;
}

interface AssetWhere {
  id: string;
  sessionId: string;
  purpose: TryOnAssetPurpose;
  deletedAt: null;
}

interface AssetManyWhere {
  sessionId: string;
  deletedAt?: null;
}

interface RunWhere {
  id?: string;
  kioskDeviceId?: string;
  tryOnSessionId?: string;
  status?: string;
}

interface LookManyWhere {
  sessionId: string;
  expiresAt?: { gt: Date };
}

interface ShareWhere {
  sessionId?: string;
  revokedAt?: Date | null;
}

function matchesSession(session: FakeSession, where: SessionWhere): boolean {
  return (
    session.id === where.id &&
    (where.kioskDeviceId === undefined ||
      session.kioskDeviceId === where.kioskDeviceId) &&
    (where.status === undefined || session.status === where.status)
  );
}

function matchesRun(run: FakeRun, where: RunWhere): boolean {
  return (
    (where.id === undefined || run.id === where.id) &&
    (where.kioskDeviceId === undefined ||
      run.kioskDeviceId === where.kioskDeviceId) &&
    (where.tryOnSessionId === undefined ||
      run.tryOnSessionId === where.tryOnSessionId) &&
    (where.status === undefined || run.status === where.status)
  );
}

function matchesAssetMany(asset: FakeAsset, where: AssetManyWhere): boolean {
  return (
    asset.sessionId === where.sessionId &&
    (where.deletedAt === undefined || asset.deletedAt === where.deletedAt)
  );
}

function matchesLookMany(look: FakeLook, where: LookManyWhere): boolean {
  return (
    look.sessionId === where.sessionId &&
    (where.expiresAt?.gt === undefined || look.expiresAt > where.expiresAt.gt)
  );
}

function matchesShare(share: FakeShare, where: ShareWhere): boolean {
  return (
    (where.sessionId === undefined || share.sessionId === where.sessionId) &&
    (where.revokedAt === undefined || share.revokedAt === where.revokedAt)
  );
}

class FakeStorage {
  readonly deletedKeys: string[] = [];

  async deleteObject(key: string): Promise<void> {
    this.deletedKeys.push(key);
  }
}
