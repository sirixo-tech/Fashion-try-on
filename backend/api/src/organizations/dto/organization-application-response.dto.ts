import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ActivationRequirementStatus,
  OrganizationApplicationStatus,
  OrganizationMembershipRole,
  OrganizationStatus,
  MembershipStatus,
  MembershipStoreScopeMode,
} from "@prisma/client";

import { PaginationResponseDto } from "../../common/pagination.dto.js";

export class OrganizationSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ enum: OrganizationStatus })
  status!: OrganizationStatus;
}

export class IntendedOwnerMembershipDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: OrganizationMembershipRole })
  role!: OrganizationMembershipRole;

  @ApiProperty({ enum: MembershipStatus })
  status!: MembershipStatus;

  @ApiProperty({ enum: MembershipStoreScopeMode })
  storeScopeMode!: MembershipStoreScopeMode;
}

export class ActivationRequirementResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  required!: boolean;

  @ApiProperty({ enum: ActivationRequirementStatus })
  status!: ActivationRequirementStatus;

  @ApiPropertyOptional({ nullable: true })
  satisfiedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  waivedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reviewedByUserId!: string | null;
}

export class OrganizationApplicationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: OrganizationApplicationStatus })
  status!: OrganizationApplicationStatus;

  @ApiProperty()
  organization!: OrganizationSummaryDto;

  @ApiProperty()
  submittedByUserId!: string;

  @ApiPropertyOptional({ nullable: true })
  submittedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reviewStartedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reviewedByUserId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  approvedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  rejectedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reviewNotes!: string | null;

  @ApiProperty({ type: [ActivationRequirementResponseDto] })
  activationRequirements!: ActivationRequirementResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  intendedOwnerMembership!: IntendedOwnerMembershipDto | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class OrganizationApplicationListResponseDto {
  @ApiProperty({ type: [OrganizationApplicationResponseDto] })
  data!: OrganizationApplicationResponseDto[];

  @ApiProperty({ type: PaginationResponseDto })
  pagination!: PaginationResponseDto;
}
