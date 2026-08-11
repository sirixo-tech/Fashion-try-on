import { HttpStatus, Injectable } from "@nestjs/common";
import {
  MembershipStatus,
  MembershipStoreScopeMode,
  OrganizationMembershipRole,
  OrganizationStatus,
  Prisma,
  StoreStatus,
  type MembershipStoreScope,
  type Organization,
  type OrganizationMembership,
  type Store,
  type User,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../common/pagination.dto.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  hasOwnershipAuthority,
  isStoreScopeModeAllowedForRole,
  MERCHANT_PERMISSIONS,
} from "./merchant-permissions.js";
import { MAX_MEMBERSHIP_STORE_IDS } from "./organization-constraints.js";
import {
  ORGANIZATION_AUDIT_ACTIONS,
  ORGANIZATION_ERROR_CODES,
} from "./organization-error-codes.js";
import {
  type CreateMembershipDto,
  type CreateStoreDto,
  type UpdateMembershipDto,
  type UpdateOrganizationDto,
  type UpdateStoreDto,
} from "./dto/tenant-commands.dto.js";
import {
  type MembershipListResponseDto,
  type MembershipResponseDto,
  type MembershipUserResponseDto,
  type StoreListResponseDto,
  type StoreResponseDto,
  type TenantOrganizationListResponseDto,
  type TenantOrganizationResponseDto,
} from "./dto/tenant-response.dto.js";
import {
  type TenantAuthorizationResult,
  TenantAuthorizationService,
  throwAccessDenied,
} from "./tenant-authorization.service.js";

type MembershipWithRelations = OrganizationMembership & {
  storeScopes: MembershipStoreScope[];
  user: Pick<User, "id" | "email" | "displayName">;
};

@Injectable()
export class TenantManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  async listOrganizations(
    userId: string,
    query: { cursor?: string; pageSize?: number },
  ): Promise<TenantOrganizationListResponseDto> {
    const pageSize = normalizePageSize(query.pageSize);
    const records = await this.prisma.organization.findMany({
      where: {
        status: OrganizationStatus.ACTIVE,
        memberships: {
          some: { userId, status: MembershipStatus.ACTIVE },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    return paginate(records, pageSize, mapOrganization);
  }

  async getOrganization(
    userId: string,
    organizationId: string,
  ): Promise<TenantOrganizationResponseDto> {
    await this.authorization.authorize(
      userId,
      organizationId,
      MERCHANT_PERMISSIONS.organizationRead,
    );
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) {
      throwAccessDenied();
    }
    return mapOrganization(organization);
  }

  async updateOrganization(
    userId: string,
    organizationId: string,
    input: UpdateOrganizationDto,
  ): Promise<TenantOrganizationResponseDto> {
    await this.authorization.authorize(
      userId,
      organizationId,
      MERCHANT_PERMISSIONS.organizationUpdate,
    );

    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.settings !== undefined
          ? { settings: safeJson(input.settings) }
          : {}),
      },
    });

    await createAudit(this.prisma, {
      action: ORGANIZATION_AUDIT_ACTIONS.organizationUpdated,
      actorUserId: userId,
      organizationId,
      resourceType: "organization",
      resourceId: organizationId,
      metadata: safeJson({
        changed_fields: Object.keys(input),
      }),
    });

    return mapOrganization(organization);
  }

  async listStores(
    userId: string,
    organizationId: string,
    query: { cursor?: string; pageSize?: number },
  ): Promise<StoreListResponseDto> {
    const auth = await this.authorization.authorize(
      userId,
      organizationId,
      MERCHANT_PERMISSIONS.storeRead,
    );
    const pageSize = normalizePageSize(query.pageSize);
    const authorizedStoreIds =
      await this.authorization.authorizedStoreIdsForMembership(
        organizationId,
        auth.membership.id,
        auth.membership.storeScopeMode,
      );

    const records = await this.prisma.store.findMany({
      where: {
        orgId: organizationId,
        ...(authorizedStoreIds ? { id: { in: authorizedStoreIds } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    return paginate(records, pageSize, mapStore);
  }

  async createStore(
    userId: string,
    organizationId: string,
    input: CreateStoreDto,
  ): Promise<StoreResponseDto> {
    await this.authorization.authorize(
      userId,
      organizationId,
      MERCHANT_PERMISSIONS.storeCreate,
    );

    const store = await this.prisma.store.create({
      data: {
        id: createSelfxId(),
        orgId: organizationId,
        name: input.name,
        code: input.code,
        timezone: input.timezone ?? "UTC",
        addressJson: safeJson(input.addressJson),
        settings: safeJson(input.settings),
      },
    });

    await createAudit(this.prisma, {
      action: ORGANIZATION_AUDIT_ACTIONS.storeCreated,
      actorUserId: userId,
      organizationId,
      storeId: store.id,
      resourceType: "store",
      resourceId: store.id,
    });

    return mapStore(store);
  }

  async getStore(
    userId: string,
    organizationId: string,
    storeId: string,
  ): Promise<StoreResponseDto> {
    await this.authorization.authorize(
      userId,
      organizationId,
      MERCHANT_PERMISSIONS.storeRead,
      { storeId },
    );
    const store = await findStoreOrThrow(this.prisma, organizationId, storeId);
    return mapStore(store);
  }

  async updateStore(
    userId: string,
    organizationId: string,
    storeId: string,
    input: UpdateStoreDto,
  ): Promise<StoreResponseDto> {
    const permission =
      input.status === StoreStatus.CLOSED
        ? MERCHANT_PERMISSIONS.storeArchive
        : MERCHANT_PERMISSIONS.storeUpdate;
    await this.authorization.authorize(userId, organizationId, permission, {
      storeId,
    });

    const store = await this.prisma.store.update({
      where: { orgId_id: { orgId: organizationId, id: storeId } },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.addressJson !== undefined
          ? { addressJson: safeJson(input.addressJson) }
          : {}),
        ...(input.settings !== undefined
          ? { settings: safeJson(input.settings) }
          : {}),
      },
    });

    await createAudit(this.prisma, {
      action:
        input.status === StoreStatus.CLOSED
          ? ORGANIZATION_AUDIT_ACTIONS.storeArchived
          : ORGANIZATION_AUDIT_ACTIONS.storeUpdated,
      actorUserId: userId,
      organizationId,
      storeId,
      resourceType: "store",
      resourceId: storeId,
      metadata: safeJson({
        changed_fields: Object.keys(input),
      }),
    });

    return mapStore(store);
  }

  async listMemberships(
    userId: string,
    organizationId: string,
    query: { cursor?: string; pageSize?: number },
  ): Promise<MembershipListResponseDto> {
    const auth = await this.authorization.authorize(
      userId,
      organizationId,
      MERCHANT_PERMISSIONS.membershipRead,
    );
    const pageSize = normalizePageSize(query.pageSize);
    const visibilityWhere = await this.membershipVisibilityWhere(
      organizationId,
      auth,
    );

    const records = await this.prisma.organizationMembership.findMany({
      where: {
        orgId: organizationId,
        ...visibilityWhere,
      },
      include: membershipInclude(),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    return paginate(records, pageSize, mapMembership);
  }

  async createMembership(
    userId: string,
    organizationId: string,
    input: CreateMembershipDto,
  ): Promise<MembershipResponseDto> {
    const auth = await this.authorization.authorize(
      userId,
      organizationId,
      MERCHANT_PERMISSIONS.membershipCreate,
    );
    assertCanAssignRole(auth, input.role);
    assertRoleStoreScopeCompatible(input.role, input.storeScopeMode);
    await assertScopeStoresBelongToOrganization(
      this.prisma,
      organizationId,
      input.storeScopeMode,
      input.storeIds ?? [],
    );

    const existingUser = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!existingUser) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        ORGANIZATION_ERROR_CODES.membershipNotFound,
        "User was not found.",
      );
    }

    const membership = await this.prisma
      .$transaction(async (tx) => {
        const membershipId = createSelfxId();
        await tx.organizationMembership.create({
          data: {
            id: membershipId,
            orgId: organizationId,
            userId: input.userId,
            role: input.role,
            status: MembershipStatus.ACTIVE,
            storeScopeMode: input.storeScopeMode,
            joinedAt: new Date(),
          },
          include: membershipInclude(),
        });

        await replaceStoreScopes(
          tx,
          organizationId,
          membershipId,
          input.storeScopeMode,
          input.storeIds ?? [],
        );

        await createAudit(tx, {
          action: ORGANIZATION_AUDIT_ACTIONS.membershipCreated,
          actorUserId: userId,
          organizationId,
          resourceType: "organization_membership",
          resourceId: membershipId,
          metadata: safeJson({
            user_id: input.userId,
            role: input.role,
            store_scope_mode: input.storeScopeMode,
            store_ids: input.storeIds ?? [],
          }),
        });

        return tx.organizationMembership.findUniqueOrThrow({
          where: { id: membershipId },
          include: membershipInclude(),
        });
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new ApiErrorException(
            HttpStatus.CONFLICT,
            ORGANIZATION_ERROR_CODES.membershipAlreadyExists,
            "Membership already exists.",
          );
        }
        throw error;
      });

    return mapMembership(membership);
  }

  async updateMembership(
    userId: string,
    organizationId: string,
    membershipId: string,
    input: UpdateMembershipDto,
  ): Promise<MembershipResponseDto> {
    const auth = await this.authorization.authorize(
      userId,
      organizationId,
      MERCHANT_PERMISSIONS.membershipUpdate,
    );

    if (input.role !== undefined) {
      await this.authorization.authorize(
        userId,
        organizationId,
        MERCHANT_PERMISSIONS.membershipRoleUpdate,
      );
    }

    if (input.storeScopeMode !== undefined || input.storeIds !== undefined) {
      await this.authorization.authorize(
        userId,
        organizationId,
        MERCHANT_PERMISSIONS.membershipScopeUpdate,
      );
    }

    const membership = await this.prisma.$transaction(async (tx) => {
      await lockOrganizationMutation(tx, organizationId);
      const target = await findMembershipOrThrow(
        tx,
        organizationId,
        membershipId,
      );
      const nextRole = input.role ?? target.role;
      const nextScopeMode = input.storeScopeMode ?? target.storeScopeMode;
      const nextStoreIds =
        input.storeIds ?? target.storeScopes.map((s) => s.storeId);

      if (input.role !== undefined) {
        assertCanMutateOwner(auth, target, input.role);
        assertCanAssignRole(auth, input.role);
        if (
          target.role === OrganizationMembershipRole.ORGANIZATION_OWNER &&
          input.role !== OrganizationMembershipRole.ORGANIZATION_OWNER
        ) {
          await assertNotFinalActiveOwner(tx, organizationId, target.id);
        }
      }

      assertRoleStoreScopeCompatible(nextRole, nextScopeMode);
      await assertScopeStoresBelongToOrganization(
        tx,
        organizationId,
        nextScopeMode,
        nextStoreIds,
      );

      const updated = await tx.organizationMembership.update({
        where: { id: membershipId },
        data: {
          ...(input.role !== undefined ? { role: nextRole } : {}),
          storeScopeMode: nextScopeMode,
        },
        include: membershipInclude(),
      });

      if (input.storeScopeMode !== undefined || input.storeIds !== undefined) {
        await replaceStoreScopes(
          tx,
          organizationId,
          membershipId,
          nextScopeMode,
          nextStoreIds,
        );
      }

      if (input.role !== undefined && input.role !== target.role) {
        await createAudit(tx, {
          action: ORGANIZATION_AUDIT_ACTIONS.membershipRoleChanged,
          actorUserId: userId,
          organizationId,
          resourceType: "organization_membership",
          resourceId: membershipId,
          metadata: safeJson({ from: target.role, to: input.role }),
        });
      }

      if (input.storeScopeMode !== undefined || input.storeIds !== undefined) {
        await createAudit(tx, {
          action: ORGANIZATION_AUDIT_ACTIONS.membershipScopeChanged,
          actorUserId: userId,
          organizationId,
          resourceType: "organization_membership",
          resourceId: membershipId,
          metadata: safeJson({
            store_scope_mode: nextScopeMode,
            store_ids: nextStoreIds,
          }),
        });
      }

      return tx.organizationMembership.findUniqueOrThrow({
        where: { id: updated.id },
        include: membershipInclude(),
      });
    });

    return mapMembership(membership);
  }

  async suspendMembership(
    userId: string,
    organizationId: string,
    membershipId: string,
  ): Promise<MembershipResponseDto> {
    const auth = await this.authorization.authorize(
      userId,
      organizationId,
      MERCHANT_PERMISSIONS.membershipSuspend,
    );
    const membership = await this.prisma.$transaction(async (tx) => {
      await lockOrganizationMutation(tx, organizationId);
      const target = await findMembershipOrThrow(
        tx,
        organizationId,
        membershipId,
      );
      assertCanMutateOwner(auth, target);
      if (
        target.role === OrganizationMembershipRole.ORGANIZATION_OWNER &&
        target.status === MembershipStatus.ACTIVE
      ) {
        await assertNotFinalActiveOwner(tx, organizationId, target.id);
      }

      await tx.organizationMembership.update({
        where: { id: membershipId },
        data: { status: MembershipStatus.SUSPENDED, suspendedAt: new Date() },
      });
      await createAudit(tx, {
        action: ORGANIZATION_AUDIT_ACTIONS.membershipSuspended,
        actorUserId: userId,
        organizationId,
        resourceType: "organization_membership",
        resourceId: membershipId,
      });
      return tx.organizationMembership.findUniqueOrThrow({
        where: { id: membershipId },
        include: membershipInclude(),
      });
    });

    return mapMembership(membership);
  }

  async reactivateMembership(
    userId: string,
    organizationId: string,
    membershipId: string,
  ): Promise<MembershipResponseDto> {
    const auth = await this.authorization.authorize(
      userId,
      organizationId,
      MERCHANT_PERMISSIONS.membershipReactivate,
    );
    const target = await findMembershipOrThrow(
      this.prisma,
      organizationId,
      membershipId,
    );
    assertCanMutateOwner(auth, target);

    const membership = await this.prisma.$transaction(async (tx) => {
      await tx.organizationMembership.update({
        where: { id: membershipId },
        data: {
          status: MembershipStatus.ACTIVE,
          suspendedAt: null,
          joinedAt: target.joinedAt ?? new Date(),
        },
      });
      await createAudit(tx, {
        action: ORGANIZATION_AUDIT_ACTIONS.membershipReactivated,
        actorUserId: userId,
        organizationId,
        resourceType: "organization_membership",
        resourceId: membershipId,
      });
      return tx.organizationMembership.findUniqueOrThrow({
        where: { id: membershipId },
        include: membershipInclude(),
      });
    });

    return mapMembership(membership);
  }

  private async membershipVisibilityWhere(
    organizationId: string,
    auth: TenantAuthorizationResult,
  ): Promise<Prisma.OrganizationMembershipWhereInput> {
    if (
      auth.membership.role === OrganizationMembershipRole.ORGANIZATION_OWNER ||
      auth.membership.role === OrganizationMembershipRole.ORGANIZATION_ADMIN
    ) {
      return {};
    }

    const authorizedStoreIds =
      await this.authorization.authorizedStoreIdsForMembership(
        organizationId,
        auth.membership.id,
        auth.membership.storeScopeMode,
      );

    if (authorizedStoreIds === null) {
      return {};
    }
    if (authorizedStoreIds.length === 0) {
      return { id: auth.membership.id };
    }

    return {
      OR: [
        { id: auth.membership.id },
        { storeScopeMode: MembershipStoreScopeMode.ALL_STORES },
        {
          storeScopes: {
            some: { storeId: { in: authorizedStoreIds } },
          },
        },
      ],
    };
  }
}

function membershipInclude() {
  return {
    user: { select: { id: true, email: true, displayName: true } },
    storeScopes: { orderBy: { createdAt: "asc" } },
  } satisfies Prisma.OrganizationMembershipInclude;
}

async function findStoreOrThrow(
  prisma: Prisma.TransactionClient | PrismaService,
  organizationId: string,
  storeId: string,
): Promise<Store> {
  const store = await prisma.store.findFirst({
    where: { id: storeId, orgId: organizationId },
  });
  if (!store) {
    throw new ApiErrorException(
      HttpStatus.NOT_FOUND,
      ORGANIZATION_ERROR_CODES.storeNotFound,
      "Store was not found.",
    );
  }
  return store;
}

async function findMembershipOrThrow(
  prisma: Prisma.TransactionClient | PrismaService,
  organizationId: string,
  membershipId: string,
): Promise<MembershipWithRelations> {
  const membership = await prisma.organizationMembership.findFirst({
    where: { id: membershipId, orgId: organizationId },
    include: membershipInclude(),
  });
  if (!membership) {
    throw new ApiErrorException(
      HttpStatus.NOT_FOUND,
      ORGANIZATION_ERROR_CODES.membershipNotFound,
      "Membership was not found.",
    );
  }
  return membership;
}

function assertCanAssignRole(
  auth: TenantAuthorizationResult,
  role: OrganizationMembershipRole,
): void {
  if (
    role === OrganizationMembershipRole.ORGANIZATION_OWNER &&
    !hasOwnershipAuthority(auth.membership.role)
  ) {
    throw new ApiErrorException(
      HttpStatus.FORBIDDEN,
      ORGANIZATION_ERROR_CODES.ownerRoleAssignmentForbidden,
      "Only organization owners can assign owner role.",
    );
  }
}

function assertCanMutateOwner(
  auth: TenantAuthorizationResult,
  target: Pick<OrganizationMembership, "role" | "id">,
  nextRole?: OrganizationMembershipRole,
): void {
  const touchesOwner =
    target.role === OrganizationMembershipRole.ORGANIZATION_OWNER ||
    nextRole === OrganizationMembershipRole.ORGANIZATION_OWNER;
  if (touchesOwner && !hasOwnershipAuthority(auth.membership.role)) {
    throw new ApiErrorException(
      HttpStatus.FORBIDDEN,
      ORGANIZATION_ERROR_CODES.ownerMutationForbidden,
      "Owner membership mutation is forbidden.",
    );
  }
}

async function assertNotFinalActiveOwner(
  prisma: Prisma.TransactionClient | PrismaService,
  organizationId: string,
  targetMembershipId: string,
): Promise<void> {
  const owners = await prisma.organizationMembership.count({
    where: {
      orgId: organizationId,
      role: OrganizationMembershipRole.ORGANIZATION_OWNER,
      status: MembershipStatus.ACTIVE,
      id: { not: targetMembershipId },
    },
  });
  if (owners === 0) {
    throw new ApiErrorException(
      HttpStatus.CONFLICT,
      ORGANIZATION_ERROR_CODES.lastOrganizationOwner,
      "Organization must retain an active owner.",
    );
  }
}

async function lockOrganizationMutation(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${organizationId})::bigint)
  `;
}

function assertRoleStoreScopeCompatible(
  role: OrganizationMembershipRole,
  storeScopeMode: MembershipStoreScopeMode,
): void {
  if (isStoreScopeModeAllowedForRole(role, storeScopeMode)) {
    return;
  }

  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    ORGANIZATION_ERROR_CODES.invalidRoleStoreScope,
    "Role and store scope mode are incompatible.",
  );
}

async function assertScopeStoresBelongToOrganization(
  prisma: Prisma.TransactionClient | PrismaService,
  organizationId: string,
  storeScopeMode: MembershipStoreScopeMode,
  storeIds: string[],
): Promise<void> {
  if (storeIds.length > MAX_MEMBERSHIP_STORE_IDS) {
    throwInvalidStoreScope();
  }

  const uniqueStoreIds = [...new Set(storeIds)];
  if (uniqueStoreIds.length !== storeIds.length) {
    throwInvalidStoreScope();
  }

  if (storeScopeMode === MembershipStoreScopeMode.ALL_STORES) {
    if (storeIds.length > 0) {
      throwInvalidStoreScope();
    }
    return;
  }

  if (uniqueStoreIds.length === 0) {
    return;
  }

  const stores = await prisma.store.findMany({
    where: { id: { in: uniqueStoreIds }, orgId: organizationId },
    select: { id: true },
  });
  if (stores.length !== uniqueStoreIds.length) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      ORGANIZATION_ERROR_CODES.crossOrganizationStoreScope,
      "Store scope contains a store outside the organization.",
    );
  }
}

async function replaceStoreScopes(
  tx: Prisma.TransactionClient,
  organizationId: string,
  membershipId: string,
  storeScopeMode: MembershipStoreScopeMode,
  storeIds: string[],
): Promise<void> {
  await tx.membershipStoreScope.deleteMany({
    where: { orgId: organizationId, membershipId },
  });

  if (storeScopeMode === MembershipStoreScopeMode.ALL_STORES) {
    return;
  }

  const uniqueStoreIds = [...new Set(storeIds)];
  await tx.membershipStoreScope.createMany({
    data: uniqueStoreIds.map((storeId) => ({
      id: createSelfxId(),
      orgId: organizationId,
      membershipId,
      storeId,
    })),
  });
}

function throwInvalidStoreScope(): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    ORGANIZATION_ERROR_CODES.invalidStoreScope,
    "Store scope is invalid.",
  );
}

function mapOrganization(
  organization: Organization,
): TenantOrganizationResponseDto {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
    timezone: organization.timezone,
    settings: jsonRecord(organization.settings),
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt.toISOString(),
  };
}

function mapStore(store: Store): StoreResponseDto {
  return {
    id: store.id,
    organizationId: store.orgId,
    name: store.name,
    code: store.code,
    status: store.status,
    timezone: store.timezone,
    addressJson: jsonRecord(store.addressJson),
    settings: jsonRecord(store.settings),
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
  };
}

function mapMembership(
  membership: MembershipWithRelations,
): MembershipResponseDto {
  return {
    id: membership.id,
    organizationId: membership.orgId,
    user: mapMembershipUser(membership.user),
    role: membership.role,
    status: membership.status,
    storeScopeMode: membership.storeScopeMode,
    storeIds: membership.storeScopes.map((scope) => scope.storeId),
    joinedAt: toIso(membership.joinedAt),
    suspendedAt: toIso(membership.suspendedAt),
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  };
}

function mapMembershipUser(
  user: Pick<User, "id" | "email" | "displayName">,
): MembershipUserResponseDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

function paginate<T extends { id: string }, R>(
  records: T[],
  pageSize: number,
  mapper: (record: T) => R,
): { data: R[]; pagination: { hasMore: boolean; nextCursor: string | null } } {
  const hasMore = records.length > pageSize;
  const data = records.slice(0, pageSize);
  return {
    data: data.map(mapper),
    pagination: {
      hasMore,
      nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null,
    },
  };
}

function normalizePageSize(pageSize: number | undefined): number {
  if (!pageSize) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function safeJson(
  value: Record<string, unknown> | undefined,
): Prisma.InputJsonObject | undefined {
  return value as Prisma.InputJsonObject | undefined;
}

function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

async function createAudit(
  tx: Prisma.TransactionClient | PrismaService,
  input: {
    action: string;
    actorUserId: string;
    organizationId?: string;
    storeId?: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Prisma.InputJsonObject;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      id: createSelfxId(),
      action: input.action,
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      storeId: input.storeId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata,
    },
  });
}
