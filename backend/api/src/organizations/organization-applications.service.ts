import { HttpStatus, Injectable } from "@nestjs/common";
import {
  ActivationRequirementStatus,
  MembershipStatus,
  MembershipStoreScopeMode,
  OrganizationApplicationStatus,
  OrganizationMembershipRole,
  OrganizationStatus,
  Prisma,
  type OrganizationActivationRequirement,
  type OrganizationApplication,
  type OrganizationMembership,
  type Organization,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../common/pagination.dto.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import {
  ORGANIZATION_AUDIT_ACTIONS,
  ORGANIZATION_ERROR_CODES,
} from "./organization-error-codes.js";
import { type CreateActivationRequirementDto } from "./dto/activation-requirement.dto.js";
import { type CreateOrganizationApplicationDto } from "./dto/create-organization-application.dto.js";
import {
  type ActivationRequirementResponseDto,
  type IntendedOwnerMembershipDto,
  type OrganizationApplicationListResponseDto,
  type OrganizationApplicationResponseDto,
  type OrganizationSummaryDto,
} from "./dto/organization-application-response.dto.js";

type ApplicationWithRelations = OrganizationApplication & {
  organization: Organization & {
    memberships: OrganizationMembership[];
  };
  requirements: OrganizationActivationRequirement[];
};

@Injectable()
export class OrganizationApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAuthorization: PlatformAuthorizationService,
  ) {}

  async createDraft(
    userId: string,
    input: CreateOrganizationApplicationDto,
  ): Promise<OrganizationApplicationResponseDto> {
    const application = await this.prisma.$transaction(async (tx) => {
      const organizationId = createSelfxId();
      const membershipId = createSelfxId();
      const applicationId = createSelfxId();

      await tx.organization.create({
        data: {
          id: organizationId,
          name: input.organizationName,
          slug: input.slug,
          status: OrganizationStatus.PENDING_ACTIVATION,
          timezone: input.timezone ?? "UTC",
          settings: safeJson({
            onboarding: {
              businessMetadata: input.businessMetadata ?? {},
            },
          }),
        },
      });

      await tx.organizationMembership.create({
        data: {
          id: membershipId,
          orgId: organizationId,
          userId,
          role: OrganizationMembershipRole.ORGANIZATION_OWNER,
          status: MembershipStatus.PENDING_ACTIVATION,
          storeScopeMode: MembershipStoreScopeMode.ALL_STORES,
        },
      });

      const created = await tx.organizationApplication.create({
        data: {
          id: applicationId,
          organizationId,
          submittedByUserId: userId,
          status: OrganizationApplicationStatus.DRAFT,
        },
        include: applicationInclude(userId),
      });

      await createAudit(tx, {
        action: ORGANIZATION_AUDIT_ACTIONS.applicationCreated,
        actorUserId: userId,
        organizationId,
        resourceType: "organization_application",
        resourceId: applicationId,
        metadata: { status: OrganizationApplicationStatus.DRAFT },
      });

      return created;
    });

    return mapApplication(application);
  }

  async listApplicantApplications(
    userId: string,
    query: { cursor?: string; pageSize?: number },
  ): Promise<OrganizationApplicationListResponseDto> {
    return this.listApplications(
      {
        submittedByUserId: userId,
      },
      userId,
      query,
    );
  }

  async getApplicantApplication(
    userId: string,
    applicationId: string,
  ): Promise<OrganizationApplicationResponseDto> {
    const application = await this.prisma.organizationApplication.findFirst({
      where: { id: applicationId, submittedByUserId: userId },
      include: applicationInclude(userId),
    });

    if (!application) {
      throwApplicationNotFound();
    }

    return mapApplication(application);
  }

  async submitApplicantApplication(
    userId: string,
    applicationId: string,
  ): Promise<OrganizationApplicationResponseDto> {
    const application = await this.transitionApplicantApplication(
      userId,
      applicationId,
      [
        OrganizationApplicationStatus.DRAFT,
        OrganizationApplicationStatus.NEEDS_INFORMATION,
      ],
      OrganizationApplicationStatus.SUBMITTED,
      ORGANIZATION_AUDIT_ACTIONS.applicationSubmitted,
      { submittedAt: new Date() },
    );

    return mapApplication(application);
  }

  async listPlatformApplications(
    actorUserId: string,
    query: { cursor?: string; pageSize?: number },
  ): Promise<OrganizationApplicationListResponseDto> {
    await this.platformAuthorization.requirePermission(
      actorUserId,
      PLATFORM_PERMISSIONS.organizationApplicationReview,
    );
    return this.listApplications({}, undefined, query);
  }

  async getPlatformApplication(
    actorUserId: string,
    applicationId: string,
  ): Promise<OrganizationApplicationResponseDto> {
    await this.platformAuthorization.requirePermission(
      actorUserId,
      PLATFORM_PERMISSIONS.organizationApplicationReview,
    );

    const application = await this.findApplication(applicationId);
    return mapApplication(application);
  }

  async startReview(
    actorUserId: string,
    applicationId: string,
  ): Promise<OrganizationApplicationResponseDto> {
    await this.platformAuthorization.requirePermission(
      actorUserId,
      PLATFORM_PERMISSIONS.organizationApplicationReview,
    );

    const application = await this.transitionPlatformApplication(
      actorUserId,
      applicationId,
      [OrganizationApplicationStatus.SUBMITTED],
      OrganizationApplicationStatus.UNDER_REVIEW,
      ORGANIZATION_AUDIT_ACTIONS.reviewStarted,
      {
        reviewStartedAt: new Date(),
        reviewedByUserId: actorUserId,
      },
    );

    return mapApplication(application);
  }

  async requestInformation(
    actorUserId: string,
    applicationId: string,
    reviewNotes?: string,
  ): Promise<OrganizationApplicationResponseDto> {
    await this.platformAuthorization.requirePermission(
      actorUserId,
      PLATFORM_PERMISSIONS.organizationApplicationReview,
    );

    const application = await this.transitionPlatformApplication(
      actorUserId,
      applicationId,
      [OrganizationApplicationStatus.UNDER_REVIEW],
      OrganizationApplicationStatus.NEEDS_INFORMATION,
      ORGANIZATION_AUDIT_ACTIONS.informationRequested,
      {
        reviewedByUserId: actorUserId,
        reviewNotes,
      },
    );

    return mapApplication(application);
  }

  async approve(
    actorUserId: string,
    applicationId: string,
    reviewNotes?: string,
  ): Promise<OrganizationApplicationResponseDto> {
    await this.platformAuthorization.requirePermission(
      actorUserId,
      PLATFORM_PERMISSIONS.organizationApplicationApprove,
    );

    const application = await this.transitionPlatformApplication(
      actorUserId,
      applicationId,
      [OrganizationApplicationStatus.UNDER_REVIEW],
      OrganizationApplicationStatus.APPROVED,
      ORGANIZATION_AUDIT_ACTIONS.applicationApproved,
      {
        approvedAt: new Date(),
        reviewedByUserId: actorUserId,
        reviewNotes,
      },
    );

    return mapApplication(application);
  }

  async reject(
    actorUserId: string,
    applicationId: string,
    reviewNotes?: string,
  ): Promise<OrganizationApplicationResponseDto> {
    await this.platformAuthorization.requirePermission(
      actorUserId,
      PLATFORM_PERMISSIONS.organizationApplicationReject,
    );

    const application = await this.transitionPlatformApplication(
      actorUserId,
      applicationId,
      [OrganizationApplicationStatus.UNDER_REVIEW],
      OrganizationApplicationStatus.REJECTED,
      ORGANIZATION_AUDIT_ACTIONS.applicationRejected,
      {
        rejectedAt: new Date(),
        reviewedByUserId: actorUserId,
        reviewNotes,
      },
    );

    return mapApplication(application);
  }

  async createRequirement(
    actorUserId: string,
    applicationId: string,
    input: CreateActivationRequirementDto,
  ): Promise<OrganizationApplicationResponseDto> {
    await this.platformAuthorization.requirePermission(
      actorUserId,
      PLATFORM_PERMISSIONS.organizationApplicationReview,
    );

    const application = await this.findApplication(applicationId);
    if (application.status === OrganizationApplicationStatus.REJECTED) {
      throwInvalidTransition();
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const requirementId = createSelfxId();
      await tx.organizationActivationRequirement.create({
        data: {
          id: requirementId,
          applicationId: application.id,
          organizationId: application.organizationId,
          code: input.code,
          required: input.required ?? true,
          status: ActivationRequirementStatus.PENDING,
          metadata: safeJson(input.metadata),
          reviewedByUserId: actorUserId,
        },
      });

      await createAudit(tx, {
        action: ORGANIZATION_AUDIT_ACTIONS.activationRequirementCreated,
        actorUserId,
        organizationId: application.organizationId,
        resourceType: "organization_activation_requirement",
        resourceId: requirementId,
        metadata: { code: input.code, required: input.required ?? true },
      });

      return tx.organizationApplication.findUniqueOrThrow({
        where: { id: application.id },
        include: applicationInclude(),
      });
    });

    return mapApplication(updated);
  }

  async satisfyRequirement(
    actorUserId: string,
    applicationId: string,
    requirementId: string,
    metadata?: Record<string, unknown>,
  ): Promise<OrganizationApplicationResponseDto> {
    return this.resolveRequirement(
      actorUserId,
      applicationId,
      requirementId,
      ActivationRequirementStatus.SATISFIED,
      ORGANIZATION_AUDIT_ACTIONS.activationRequirementSatisfied,
      metadata,
    );
  }

  async waiveRequirement(
    actorUserId: string,
    applicationId: string,
    requirementId: string,
    metadata?: Record<string, unknown>,
  ): Promise<OrganizationApplicationResponseDto> {
    return this.resolveRequirement(
      actorUserId,
      applicationId,
      requirementId,
      ActivationRequirementStatus.WAIVED,
      ORGANIZATION_AUDIT_ACTIONS.activationRequirementWaived,
      metadata,
    );
  }

  async activateOrganization(
    actorUserId: string,
    organizationId: string,
  ): Promise<OrganizationApplicationResponseDto> {
    await this.platformAuthorization.requirePermission(
      actorUserId,
      PLATFORM_PERMISSIONS.organizationActivate,
    );

    const application = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
        include: {
          applications: {
            where: { status: OrganizationApplicationStatus.APPROVED },
            orderBy: { approvedAt: "desc" },
            take: 1,
            include: {
              organization: {
                include: {
                  memberships: {
                    where: {
                      role: OrganizationMembershipRole.ORGANIZATION_OWNER,
                      status: MembershipStatus.PENDING_ACTIVATION,
                    },
                  },
                },
              },
              requirements: true,
            },
          },
        },
      });

      if (!organization) {
        throwNotActivatable();
      }
      if (organization.status === OrganizationStatus.ACTIVE) {
        throw new ApiErrorException(
          HttpStatus.CONFLICT,
          ORGANIZATION_ERROR_CODES.alreadyActive,
          "Organization is already active.",
        );
      }
      if (organization.status !== OrganizationStatus.PENDING_ACTIVATION) {
        throwNotActivatable();
      }

      const approvedApplication = organization.applications[0];
      if (!approvedApplication) {
        throwNotActivatable();
      }

      const incompleteRequirement = approvedApplication.requirements.some(
        (requirement) =>
          requirement.required &&
          requirement.status === ActivationRequirementStatus.PENDING,
      );
      if (incompleteRequirement) {
        throw new ApiErrorException(
          HttpStatus.CONFLICT,
          ORGANIZATION_ERROR_CODES.activationRequirementsIncomplete,
          "Activation requirements are incomplete.",
        );
      }

      const ownerMembership =
        approvedApplication.organization.memberships[0] ?? null;
      if (!ownerMembership) {
        throwNotActivatable();
      }

      const organizationUpdate = await tx.organization.updateMany({
        where: {
          id: organizationId,
          status: OrganizationStatus.PENDING_ACTIVATION,
        },
        data: { status: OrganizationStatus.ACTIVE },
      });
      if (organizationUpdate.count !== 1) {
        throwNotActivatable();
      }

      const membershipUpdate = await tx.organizationMembership.updateMany({
        where: {
          id: ownerMembership.id,
          status: MembershipStatus.PENDING_ACTIVATION,
        },
        data: {
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
        },
      });
      if (membershipUpdate.count !== 1) {
        throwNotActivatable();
      }

      await createAudit(tx, {
        action: ORGANIZATION_AUDIT_ACTIONS.organizationActivated,
        actorUserId,
        organizationId,
        resourceType: "organization",
        resourceId: organizationId,
        metadata: {
          application_id: approvedApplication.id,
          owner_membership_id: ownerMembership.id,
        },
      });

      return tx.organizationApplication.findUniqueOrThrow({
        where: { id: approvedApplication.id },
        include: applicationInclude(),
      });
    });

    return mapApplication(application);
  }

  async suspendOrganization(
    actorUserId: string,
    organizationId: string,
  ): Promise<{ id: string; status: OrganizationStatus }> {
    await this.platformAuthorization.requirePermission(
      actorUserId,
      PLATFORM_PERMISSIONS.organizationSuspend,
    );

    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { status: OrganizationStatus.SUSPENDED },
      select: { id: true, status: true },
    });

    await createAudit(this.prisma, {
      action: ORGANIZATION_AUDIT_ACTIONS.organizationSuspended,
      actorUserId,
      organizationId,
      resourceType: "organization",
      resourceId: organizationId,
    });

    return organization;
  }

  private async listApplications(
    where: Prisma.OrganizationApplicationWhereInput,
    intendedOwnerUserId: string | undefined,
    query: { cursor?: string; pageSize?: number },
  ): Promise<OrganizationApplicationListResponseDto> {
    const pageSize = normalizePageSize(query.pageSize);
    const records = await this.prisma.organizationApplication.findMany({
      where,
      include: applicationInclude(intendedOwnerUserId),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = records.length > pageSize;
    const data = records.slice(0, pageSize);

    return {
      data: data.map(mapApplication),
      pagination: {
        hasMore,
        nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null,
      },
    };
  }

  private async transitionApplicantApplication(
    userId: string,
    applicationId: string,
    from: OrganizationApplicationStatus[],
    to: OrganizationApplicationStatus,
    auditAction: string,
    data: Prisma.OrganizationApplicationUncheckedUpdateManyInput,
  ): Promise<ApplicationWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.organizationApplication.findFirst({
        where: { id: applicationId, submittedByUserId: userId },
        select: { id: true, organizationId: true, status: true },
      });
      if (!application) {
        throwApplicationNotFound();
      }
      assertAllowedTransition(application.status, from);

      const updatedCount = await tx.organizationApplication.updateMany({
        where: {
          id: applicationId,
          submittedByUserId: userId,
          status: application.status,
        },
        data: { ...data, status: to },
      });
      if (updatedCount.count !== 1) {
        throwInvalidTransition();
      }

      const updated = await tx.organizationApplication.findUniqueOrThrow({
        where: { id: applicationId },
        include: applicationInclude(userId),
      });

      await createAudit(tx, {
        action: auditAction,
        actorUserId: userId,
        organizationId: updated.organizationId,
        resourceType: "organization_application",
        resourceId: applicationId,
        metadata: { from: application.status, to },
      });

      return updated;
    });
  }

  private async transitionPlatformApplication(
    actorUserId: string,
    applicationId: string,
    from: OrganizationApplicationStatus[],
    to: OrganizationApplicationStatus,
    auditAction: string,
    data: Prisma.OrganizationApplicationUncheckedUpdateManyInput,
  ): Promise<ApplicationWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.organizationApplication.findUnique({
        where: { id: applicationId },
        select: { id: true, organizationId: true, status: true },
      });
      if (!application) {
        throwApplicationNotFound();
      }
      assertAllowedTransition(application.status, from);

      const updatedCount = await tx.organizationApplication.updateMany({
        where: { id: applicationId, status: application.status },
        data: { ...data, status: to },
      });
      if (updatedCount.count !== 1) {
        throwInvalidTransition();
      }

      const updated = await tx.organizationApplication.findUniqueOrThrow({
        where: { id: applicationId },
        include: applicationInclude(),
      });

      await createAudit(tx, {
        action: auditAction,
        actorUserId,
        organizationId: updated.organizationId,
        resourceType: "organization_application",
        resourceId: applicationId,
        metadata: { from: application.status, to },
      });

      return updated;
    });
  }

  private async findApplication(
    applicationId: string,
  ): Promise<ApplicationWithRelations> {
    const application = await this.prisma.organizationApplication.findUnique({
      where: { id: applicationId },
      include: applicationInclude(),
    });

    if (!application) {
      throwApplicationNotFound();
    }

    return application;
  }

  private async resolveRequirement(
    actorUserId: string,
    applicationId: string,
    requirementId: string,
    status: ActivationRequirementStatus,
    auditAction: string,
    metadata?: Record<string, unknown>,
  ): Promise<OrganizationApplicationResponseDto> {
    await this.platformAuthorization.requirePermission(
      actorUserId,
      PLATFORM_PERMISSIONS.organizationApplicationApprove,
    );

    const application = await this.findApplication(applicationId);
    const requirement = application.requirements.find(
      (item) => item.id === requirementId,
    );
    if (!requirement) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        ORGANIZATION_ERROR_CODES.requirementNotFound,
        "Activation requirement was not found.",
      );
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.organizationActivationRequirement.update({
        where: { id: requirementId },
        data: {
          status,
          metadata: safeJson(metadata),
          reviewedByUserId: actorUserId,
          satisfiedAt:
            status === ActivationRequirementStatus.SATISFIED
              ? now
              : requirement.satisfiedAt,
          waivedAt:
            status === ActivationRequirementStatus.WAIVED
              ? now
              : requirement.waivedAt,
        },
      });

      await createAudit(tx, {
        action: auditAction,
        actorUserId,
        organizationId: application.organizationId,
        resourceType: "organization_activation_requirement",
        resourceId: requirementId,
        metadata: { code: requirement.code, status },
      });

      return tx.organizationApplication.findUniqueOrThrow({
        where: { id: applicationId },
        include: applicationInclude(),
      });
    });

    return mapApplication(updated);
  }
}

function applicationInclude(intendedOwnerUserId?: string) {
  return {
    organization: {
      include: {
        memberships: {
          where: {
            role: OrganizationMembershipRole.ORGANIZATION_OWNER,
            ...(intendedOwnerUserId ? { userId: intendedOwnerUserId } : {}),
          },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    },
    requirements: {
      orderBy: { createdAt: "asc" },
    },
  } satisfies Prisma.OrganizationApplicationInclude;
}

function mapApplication(
  application: ApplicationWithRelations,
): OrganizationApplicationResponseDto {
  return {
    id: application.id,
    status: application.status,
    organization: mapOrganization(application.organization),
    submittedByUserId: application.submittedByUserId,
    submittedAt: toIso(application.submittedAt),
    reviewStartedAt: toIso(application.reviewStartedAt),
    reviewedByUserId: application.reviewedByUserId,
    approvedAt: toIso(application.approvedAt),
    rejectedAt: toIso(application.rejectedAt),
    reviewNotes: application.reviewNotes,
    activationRequirements: application.requirements.map(mapRequirement),
    intendedOwnerMembership: mapMembership(
      application.organization.memberships[0] ?? null,
    ),
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
  };
}

function mapOrganization(organization: Organization): OrganizationSummaryDto {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
  };
}

function mapMembership(
  membership: OrganizationMembership | null,
): IntendedOwnerMembershipDto | null {
  if (!membership) {
    return null;
  }
  return {
    id: membership.id,
    role: membership.role,
    status: membership.status,
    storeScopeMode: membership.storeScopeMode,
  };
}

function mapRequirement(
  requirement: OrganizationActivationRequirement,
): ActivationRequirementResponseDto {
  return {
    id: requirement.id,
    code: requirement.code,
    required: requirement.required,
    status: requirement.status,
    satisfiedAt: toIso(requirement.satisfiedAt),
    waivedAt: toIso(requirement.waivedAt),
    reviewedByUserId: requirement.reviewedByUserId,
  };
}

function normalizePageSize(pageSize: number | undefined): number {
  if (!pageSize) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
}

function assertAllowedTransition(
  actual: OrganizationApplicationStatus,
  allowed: OrganizationApplicationStatus[],
): void {
  if (!allowed.includes(actual)) {
    throwInvalidTransition();
  }
}

function throwInvalidTransition(): never {
  throw new ApiErrorException(
    HttpStatus.CONFLICT,
    ORGANIZATION_ERROR_CODES.invalidApplicationTransition,
    "Application transition is not allowed.",
  );
}

function throwApplicationNotFound(): never {
  throw new ApiErrorException(
    HttpStatus.NOT_FOUND,
    ORGANIZATION_ERROR_CODES.applicationNotFound,
    "Organization application was not found.",
  );
}

function throwNotActivatable(): never {
  throw new ApiErrorException(
    HttpStatus.CONFLICT,
    ORGANIZATION_ERROR_CODES.notActivatable,
    "Organization is not activatable.",
  );
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function safeJson(
  value: Record<string, unknown> | undefined,
): Prisma.InputJsonObject | undefined {
  return value as Prisma.InputJsonObject | undefined;
}

async function createAudit(
  tx: Prisma.TransactionClient | PrismaService,
  input: {
    action: string;
    actorUserId: string;
    organizationId?: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      id: createSelfxId(),
      action: input.action,
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: safeJson(input.metadata),
    },
  });
}
