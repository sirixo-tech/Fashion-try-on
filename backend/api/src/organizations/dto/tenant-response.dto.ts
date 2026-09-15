import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  MembershipStatus,
  ImpersonationSessionStatus,
  MembershipStoreScopeMode,
  OrganizationMembershipRole,
  OrganizationStatus,
  StoreStatus,
} from "@prisma/client";

import { PaginationResponseDto } from "../../common/pagination.dto.js";
import { EffectiveStorePermissionsResponseDto } from "../../rbac/dto/store-rbac.dto.js";

export class TenantOrganizationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ enum: OrganizationStatus })
  status!: OrganizationStatus;

  @ApiProperty()
  timezone!: string;

  @ApiPropertyOptional({ type: Object, nullable: true })
  settings!: Record<string, unknown> | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class TenantOrganizationListResponseDto {
  @ApiProperty({ type: [TenantOrganizationResponseDto] })
  data!: TenantOrganizationResponseDto[];

  @ApiProperty({ type: PaginationResponseDto })
  pagination!: PaginationResponseDto;
}

export class CurrentTenantStoreResponseDto {
  @ApiPropertyOptional({ type: TenantOrganizationResponseDto, nullable: true })
  store!: TenantOrganizationResponseDto | null;

  @ApiPropertyOptional({
    type: EffectiveStorePermissionsResponseDto,
    nullable: true,
  })
  permissions!: EffectiveStorePermissionsResponseDto | null;

  @ApiProperty()
  hasMultipleStores!: boolean;

  @ApiPropertyOptional({ type: Object, nullable: true })
  impersonation!: CurrentTenantStoreImpersonationDto | null;
}

export class CurrentTenantStoreImpersonationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  actorUserId!: string;

  @ApiProperty()
  targetStoreId!: string;

  @ApiProperty()
  targetStoreName!: string;

  @ApiProperty()
  targetStoreSlug!: string;

  @ApiProperty({ enum: ImpersonationSessionStatus })
  status!: ImpersonationSessionStatus;

  @ApiProperty()
  startedAt!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiPropertyOptional({ nullable: true })
  endedAt!: string | null;
}

export class StoreResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  code!: string | null;

  @ApiProperty({ enum: StoreStatus })
  status!: StoreStatus;

  @ApiProperty()
  timezone!: string;

  @ApiPropertyOptional({ type: Object, nullable: true })
  addressJson!: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  settings!: Record<string, unknown> | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class StoreListResponseDto {
  @ApiProperty({ type: [StoreResponseDto] })
  data!: StoreResponseDto[];

  @ApiProperty({ type: PaginationResponseDto })
  pagination!: PaginationResponseDto;
}

export class MembershipUserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;
}

export class MembershipResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  organizationId!: string;

  @ApiProperty({ type: MembershipUserResponseDto })
  user!: MembershipUserResponseDto;

  @ApiProperty({ enum: OrganizationMembershipRole })
  role!: OrganizationMembershipRole;

  @ApiProperty({ enum: MembershipStatus })
  status!: MembershipStatus;

  @ApiProperty({ enum: MembershipStoreScopeMode })
  storeScopeMode!: MembershipStoreScopeMode;

  @ApiProperty({ type: [String] })
  storeIds!: string[];

  @ApiPropertyOptional({ nullable: true })
  joinedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  suspendedAt!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class MembershipListResponseDto {
  @ApiProperty({ type: [MembershipResponseDto] })
  data!: MembershipResponseDto[];

  @ApiProperty({ type: PaginationResponseDto })
  pagination!: PaginationResponseDto;
}
