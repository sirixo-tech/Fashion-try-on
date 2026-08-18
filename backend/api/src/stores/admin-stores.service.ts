import { HttpStatus, Injectable } from "@nestjs/common";
import {
  KioskAssignmentScope,
  KioskDeviceStatus,
  OrganizationStatus,
  Prisma,
  type KioskDevice,
  type KioskDeviceConfiguration,
  type Organization,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { KioskService, mapDevice } from "../kiosks/kiosk.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import {
  AdminStoreStatus,
  type AdminStoreDetailResponseDto,
  type AdminStoreListQueryDto,
  type AdminStoreListResponseDto,
  type AdminStoreResponseDto,
  type CreateAdminStoreDto,
  type PairStoreKioskDto,
  type StoreKioskDeviceResponseDto,
  type StoreKioskPairResponseDto,
  type UpdateAdminStoreDto,
  pairStoreKioskToPairKioskDto,
} from "./dto/admin-store.dto.js";

export const STORE_ERROR_CODES = {
  storeNotFound: "STORE_NOT_FOUND",
  storeInactive: "STORE_INACTIVE",
  storeSlugConflict: "STORE_SLUG_CONFLICT",
  kioskNotFound: "KIOSK_NOT_FOUND",
  kioskStoreMismatch: "KIOSK_STORE_MISMATCH",
} as const;

type DeviceWithAssignment = KioskDevice & {
  organization: { id: string; name: string } | null;
  store: { id: string; name: string } | null;
  configuration?: Pick<KioskDeviceConfiguration, "version"> | null;
};

type StoreProfile = {
  contactEmail?: string | null;
  contactPhone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

type StoreStats = {
  totalKiosks: number;
  activeKiosks: number;
  offlineKiosks: number;
  lastActivityAt: Date | null;
};

const defaultPage = 1;
const defaultPageSize = 25;
const maxPageSize = 100;

@Injectable()
export class AdminStoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kiosks: KioskService,
    private readonly rbac: StoreRbacService,
  ) {}

  async listStores(
    query: AdminStoreListQueryDto,
  ): Promise<AdminStoreListResponseDto> {
    const page = boundedPositiveInt(query.page, defaultPage);
    const pageSize = Math.min(
      boundedPositiveInt(query.pageSize, defaultPageSize),
      maxPageSize,
    );
    const where = storeWhere(query);
    const [total, stores] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        orderBy: storeOrderBy(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const stats = await this.kioskStatsForStores(
      stores.map((store) => store.id),
    );
    return {
      data: stores.map((store) => mapStore(store, stats.get(store.id))),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        hasMore: page * pageSize < total,
      },
    };
  }

  async createStore(
    input: CreateAdminStoreDto,
  ): Promise<AdminStoreResponseDto> {
    const slug = normalizeSlug(input.slug ?? slugFromName(input.name));
    try {
      const store = await this.prisma.$transaction(async (tx) => {
        const created = await tx.organization.create({
          data: {
            id: createSelfxId(),
            name: input.name.trim(),
            slug,
            status: OrganizationStatus.ACTIVE,
            timezone: input.timezone?.trim() || "UTC",
            settings: storeSettingsFromInput(input),
          },
        });
        await this.rbac.ensureStoreRbacInTransaction(tx, created.id, true);
        return created;
      });
      return mapStore(store);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ApiErrorException(
          HttpStatus.CONFLICT,
          STORE_ERROR_CODES.storeSlugConflict,
          "Store slug is already in use.",
        );
      }
      throw error;
    }
  }

  async getStore(storeId: string): Promise<AdminStoreDetailResponseDto> {
    const store = await this.findStoreOrThrow(storeId);
    const stats = await this.kioskStatsForStores([store.id]);
    return {
      ...mapStore(store, stats.get(store.id)),
      kiosks: await this.listStoreKiosks(store.id),
    };
  }

  async updateStore(
    storeId: string,
    input: UpdateAdminStoreDto,
  ): Promise<AdminStoreResponseDto> {
    await this.findStoreOrThrow(storeId);
    try {
      const updated = await this.prisma.organization.update({
        where: { id: storeId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.slug !== undefined
            ? { slug: normalizeSlug(input.slug) }
            : {}),
          ...(input.status !== undefined
            ? { status: organizationStatusFromStoreStatus(input.status) }
            : {}),
          ...(input.timezone !== undefined
            ? { timezone: input.timezone.trim() || "UTC" }
            : {}),
          settings: await this.updatedStoreSettings(storeId, input),
        },
      });
      return mapStore(updated);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ApiErrorException(
          HttpStatus.CONFLICT,
          STORE_ERROR_CODES.storeSlugConflict,
          "Store slug is already in use.",
        );
      }
      throw error;
    }
  }

  async deactivateStore(storeId: string): Promise<AdminStoreResponseDto> {
    await this.findStoreOrThrow(storeId);
    const store = await this.prisma.organization.update({
      where: { id: storeId },
      data: { status: OrganizationStatus.SUSPENDED },
    });
    return mapStore(store);
  }

  async activateStore(storeId: string): Promise<AdminStoreResponseDto> {
    await this.findStoreOrThrow(storeId);
    const store = await this.prisma.organization.update({
      where: { id: storeId },
      data: { status: OrganizationStatus.ACTIVE },
    });
    return mapStore(store);
  }

  async listStoreKiosks(storeId: string) {
    await this.findStoreOrThrow(storeId);
    const data = await this.prisma.kioskDevice.findMany({
      where: {
        organizationId: storeId,
        status: { not: KioskDeviceStatus.DELETED },
      },
      include: assignmentInclude(),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return { data: data.map((device) => mapDevice(device)) };
  }

  async pairStoreKiosk(
    actorUserId: string,
    storeId: string,
    input: PairStoreKioskDto,
  ): Promise<StoreKioskPairResponseDto> {
    const store = await this.findStoreOrThrow(storeId);
    assertStoreActive(store);
    return {
      device: await this.kiosks.pairKiosk(
        actorUserId,
        pairStoreKioskToPairKioskDto(input, store.id),
      ),
    };
  }

  async assignKioskToStore(
    actorUserId: string,
    storeId: string,
    kioskDeviceId: string,
  ): Promise<StoreKioskDeviceResponseDto> {
    const store = await this.findStoreOrThrow(storeId);
    assertStoreActive(store);
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.kioskDevice.findUnique({
        where: { id: kioskDeviceId },
      });
      if (!existing || existing.status === KioskDeviceStatus.DELETED) {
        throw new ApiErrorException(
          HttpStatus.NOT_FOUND,
          STORE_ERROR_CODES.kioskNotFound,
          "Kiosk device was not found.",
        );
      }
      const device = await tx.kioskDevice.update({
        where: { id: kioskDeviceId },
        data: {
          assignmentScope: KioskAssignmentScope.ORGANIZATION,
          organizationId: store.id,
          storeId: null,
        },
        include: assignmentInclude(),
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          action: "KIOSK_ASSIGNED",
          actorUserId,
          organizationId: store.id,
          resourceType: "kiosk_device",
          resourceId: kioskDeviceId,
          metadata: {
            assignment_scope: KioskAssignmentScope.ORGANIZATION,
            product_store_id: store.id,
          },
        },
      });
      return device;
    });
    return mapDevice(updated);
  }

  async getStoreKiosk(
    storeId: string,
    kioskDeviceId: string,
  ): Promise<StoreKioskDeviceResponseDto> {
    return mapDevice(await this.requireKioskInStore(storeId, kioskDeviceId));
  }

  async requireKioskInStore(
    storeId: string,
    kioskDeviceId: string,
  ): Promise<DeviceWithAssignment> {
    await this.findStoreOrThrow(storeId);
    const device = await this.prisma.kioskDevice.findUnique({
      where: { id: kioskDeviceId },
      include: assignmentInclude(),
    });
    if (!device || device.status === KioskDeviceStatus.DELETED) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        STORE_ERROR_CODES.kioskNotFound,
        "Kiosk device was not found.",
      );
    }
    if (device.organizationId !== storeId) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        STORE_ERROR_CODES.kioskStoreMismatch,
        "Kiosk device was not found for this store.",
      );
    }
    return device;
  }

  private async findStoreOrThrow(storeId: string): Promise<Organization> {
    const store = await this.prisma.organization.findUnique({
      where: { id: storeId },
    });
    if (!store) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        STORE_ERROR_CODES.storeNotFound,
        "Store was not found.",
      );
    }
    return store;
  }

  private async updatedStoreSettings(
    storeId: string,
    input: UpdateAdminStoreDto,
  ): Promise<Prisma.InputJsonValue | undefined> {
    const profileInput = storeProfileInput(input);
    if (Object.keys(profileInput).length === 0) {
      return undefined;
    }
    const existing = await this.prisma.organization.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });
    return mergeStoreProfile(existing?.settings, profileInput);
  }

  private async kioskStatsForStores(
    storeIds: string[],
  ): Promise<Map<string, StoreStats>> {
    const stats = new Map<string, StoreStats>();
    for (const storeId of storeIds) {
      stats.set(storeId, {
        totalKiosks: 0,
        activeKiosks: 0,
        offlineKiosks: 0,
        lastActivityAt: null,
      });
    }
    if (storeIds.length === 0) {
      return stats;
    }
    const grouped = await this.prisma.kioskDevice.groupBy({
      by: ["organizationId", "status"],
      where: {
        organizationId: { in: storeIds },
        status: { not: KioskDeviceStatus.DELETED },
      },
      _count: { _all: true },
      _max: { lastSeenAt: true },
    });
    for (const row of grouped) {
      if (!row.organizationId) {
        continue;
      }
      const current = stats.get(row.organizationId);
      if (!current) {
        continue;
      }
      current.totalKiosks += row._count._all;
      if (row.status === KioskDeviceStatus.ACTIVE) {
        current.activeKiosks += row._count._all;
      }
      if (
        row._max.lastSeenAt &&
        (!current.lastActivityAt ||
          row._max.lastSeenAt > current.lastActivityAt)
      ) {
        current.lastActivityAt = row._max.lastSeenAt;
      }
    }
    return stats;
  }
}

function storeWhere(
  query: AdminStoreListQueryDto,
): Prisma.OrganizationWhereInput {
  const search = query.search?.trim();
  return {
    ...(query.status ? { status: organizationStatusFilter(query.status) } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search.toLowerCase(), mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

function organizationStatusFilter(
  status: AdminStoreStatus,
): Prisma.EnumOrganizationStatusFilter | OrganizationStatus {
  if (status === AdminStoreStatus.ACTIVE) {
    return OrganizationStatus.ACTIVE;
  }
  return { not: OrganizationStatus.ACTIVE };
}

function storeOrderBy(
  sort: AdminStoreListQueryDto["sort"],
): Prisma.OrganizationOrderByWithRelationInput[] {
  switch (sort) {
    case "createdAsc":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "nameAsc":
      return [{ name: "asc" }, { id: "asc" }];
    case "nameDesc":
      return [{ name: "desc" }, { id: "desc" }];
    case "createdDesc":
    default:
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
}

function mapStore(
  store: Organization,
  stats: StoreStats = {
    totalKiosks: 0,
    activeKiosks: 0,
    offlineKiosks: 0,
    lastActivityAt: null,
  },
): AdminStoreResponseDto {
  const profile = storeProfileFromSettings(store.settings);
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    status: storeStatusFromOrganizationStatus(store.status),
    contactEmail: profile.contactEmail ?? null,
    contactPhone: profile.contactPhone ?? null,
    website: profile.website ?? null,
    address: profile.address ?? null,
    city: profile.city ?? null,
    stateRegion: profile.stateRegion ?? null,
    postalCode: profile.postalCode ?? null,
    country: profile.country ?? null,
    timezone: store.timezone,
    totalKiosks: stats.totalKiosks,
    activeKiosks: stats.activeKiosks,
    offlineKiosks: stats.offlineKiosks,
    lastActivityAt: stats.lastActivityAt?.toISOString() ?? null,
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
    internalLegacyModel: "ORGANIZATION_AS_STORE",
  };
}

function storeStatusFromOrganizationStatus(
  status: OrganizationStatus,
): AdminStoreStatus {
  return status === OrganizationStatus.ACTIVE
    ? AdminStoreStatus.ACTIVE
    : AdminStoreStatus.INACTIVE;
}

function organizationStatusFromStoreStatus(
  status: AdminStoreStatus,
): OrganizationStatus {
  return status === AdminStoreStatus.ACTIVE
    ? OrganizationStatus.ACTIVE
    : OrganizationStatus.SUSPENDED;
}

function storeSettingsFromInput(
  input: CreateAdminStoreDto,
): Prisma.InputJsonValue {
  return mergeStoreProfile(null, storeProfileInput(input));
}

function storeProfileInput(
  input: CreateAdminStoreDto | UpdateAdminStoreDto,
): StoreProfile {
  return {
    ...(input.contactEmail !== undefined
      ? { contactEmail: nullableTrim(input.contactEmail) }
      : {}),
    ...(input.contactPhone !== undefined
      ? { contactPhone: nullableTrim(input.contactPhone) }
      : {}),
    ...(input.website !== undefined
      ? { website: nullableTrim(input.website) }
      : {}),
    ...(input.address !== undefined
      ? { address: nullableTrim(input.address) }
      : {}),
    ...(input.city !== undefined ? { city: nullableTrim(input.city) } : {}),
    ...(input.stateRegion !== undefined
      ? { stateRegion: nullableTrim(input.stateRegion) }
      : {}),
    ...(input.postalCode !== undefined
      ? { postalCode: nullableTrim(input.postalCode) }
      : {}),
    ...(input.country !== undefined
      ? { country: nullableTrim(input.country) }
      : {}),
  };
}

function mergeStoreProfile(
  settings: Prisma.JsonValue | null | undefined,
  profile: StoreProfile,
): Prisma.InputJsonValue {
  const base = isRecord(settings) ? settings : {};
  const currentProfile = isRecord(base.storeProfile) ? base.storeProfile : {};
  return {
    ...base,
    storeProfile: {
      ...currentProfile,
      ...profile,
    },
  } as Prisma.InputJsonValue;
}

function storeProfileFromSettings(
  settings: Prisma.JsonValue | null,
): StoreProfile {
  if (!isRecord(settings) || !isRecord(settings.storeProfile)) {
    return {};
  }
  const profile = settings.storeProfile;
  return {
    contactEmail: stringOrNull(profile.contactEmail),
    contactPhone: stringOrNull(profile.contactPhone),
    website: stringOrNull(profile.website),
    address: stringOrNull(profile.address),
    city: stringOrNull(profile.city),
    stateRegion: stringOrNull(profile.stateRegion),
    postalCode: stringOrNull(profile.postalCode),
    country: stringOrNull(profile.country),
  };
}

function assertStoreActive(store: Organization): void {
  if (store.status !== OrganizationStatus.ACTIVE) {
    throw new ApiErrorException(
      HttpStatus.CONFLICT,
      STORE_ERROR_CODES.storeInactive,
      "Inactive stores cannot receive new kiosk assignments.",
    );
  }
}

function boundedPositiveInt(
  value: number | undefined,
  fallback: number,
): number {
  return Number.isInteger(value) && value && value > 0 ? value : fallback;
}

function normalizeSlug(value: string): string {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      STORE_ERROR_CODES.storeSlugConflict,
      "Store slug must be URL-safe.",
    );
  }
  return slug;
}

function slugFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || `store-${createSelfxId()}`;
}

function nullableTrim(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function assignmentInclude() {
  return {
    organization: { select: { id: true, name: true } },
    store: { select: { id: true, name: true } },
    configuration: { select: { version: true } },
  } as const;
}
