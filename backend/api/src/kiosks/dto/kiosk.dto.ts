import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import {
  KioskAssignmentScope,
  KioskCustomerUploadSessionStatus,
  KioskDeviceStatus,
  KioskPairingSessionStatus,
} from "@prisma/client";

import { KIOSK_PAIRING_CODE_PATTERN } from "../kiosk.constants.js";

export class CreateKioskPairingSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  installationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  appVersion?: string;
}

export class KioskPairingSessionResponseDto {
  pairingSessionId!: string;
  pairingCode!: string;
  provisioningSecret!: string;
  expiresAt!: string;
  serverTime!: string;
  ttlSeconds!: number;
  pollIntervalSeconds!: number;
}

export class KioskPairingStatusResponseDto {
  status!: "WAITING" | "PAIRED" | "EXPIRED";
  serverTime!: string;
  expiresAt!: string;
  provisioningGrant?: string;
}

export class PairKioskDto {
  @IsString()
  @Matches(KIOSK_PAIRING_CODE_PATTERN)
  pairingCode!: string;

  @IsString()
  @Length(1, 160)
  displayName!: string;

  @IsEnum(KioskAssignmentScope)
  assignmentScope!: KioskAssignmentScope;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;
}

export class ExchangeKioskProvisioningDto {
  @IsUUID()
  pairingSessionId!: string;

  @IsString()
  @Length(32, 512)
  provisioningSecret!: string;

  @IsString()
  @Length(32, 512)
  provisioningGrant!: string;
}

export class RefreshKioskDeviceSessionDto {
  @IsString()
  @Length(32, 512)
  refreshToken!: string;
}

export class KioskHeartbeatDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  appVersion?: string;
}

export class KioskAssignmentDto {
  scope!: KioskAssignmentScope;
  organizationId!: string | null;
  organizationName!: string | null;
  storeId!: string | null;
  storeName!: string | null;
}

export class KioskDeviceResponseDto {
  id!: string;
  displayName!: string;
  status!: KioskDeviceStatus;
  assignment!: KioskAssignmentDto;
  platform!: string | null;
  appVersion!: string | null;
  installationId!: string | null;
  pairedAt!: string;
  lastSeenAt!: string | null;
  inactiveAt!: string | null;
  revokedAt!: string | null;
  deletedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class KioskDeviceListResponseDto {
  data!: KioskDeviceResponseDto[];
}

export class KioskDeviceAuthResponseDto {
  accessToken!: string;
  accessTokenExpiresAt!: string;
  refreshToken!: string;
  refreshTokenExpiresAt!: string;
  device!: KioskDeviceResponseDto;
}

export class KioskProvisioningPairResponseDto {
  device!: KioskDeviceResponseDto;
}

export class KioskAssignmentOptionsResponseDto {
  organizations!: Array<{ id: string; name: string; status: string }>;
  stores!: Array<{
    id: string;
    organizationId: string;
    name: string;
    status: string;
  }>;
}

export class KioskPairingSessionRecordDto {
  id!: string;
  status!: KioskPairingSessionStatus;
  expiresAt!: string;
}

export class KioskCustomerUploadSessionResponseDto {
  sessionId!: string;
  status!: KioskCustomerUploadSessionStatus;
  publicUploadUrl!: string;
  expiresAt!: string;
  serverTime!: string;
  pollIntervalSeconds!: number;
  photo?: {
    readUrl: string;
    contentType: string;
    sizeBytes: number;
    width: number;
    height: number;
  };
}

export class KioskCustomerUploadSessionStatusDto {
  sessionId!: string;
  status!: KioskCustomerUploadSessionStatus;
  expiresAt!: string;
  serverTime!: string;
  rejectionCode!: string | null;
  photo?: {
    readUrl: string;
    contentType: string;
    sizeBytes: number;
    width: number;
    height: number;
  };
}

export class CustomerUploadPublicStatusDto {
  status!: KioskCustomerUploadSessionStatus;
  expiresAt!: string;
  serverTime!: string;
  maxImageBytes!: number;
}

export class CustomerUploadIntentDto {
  @IsString()
  @MaxLength(80)
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(8 * 1024 * 1024)
  sizeBytes!: number;
}

export class CustomerUploadIntentResponseDto {
  uploadUrl!: string;
  method!: "PUT";
  expiresAt!: string;
  headers!: Record<string, string>;
  maxImageBytes!: number;
}

export class CustomerUploadCompleteResponseDto {
  status!: KioskCustomerUploadSessionStatus;
  expiresAt!: string;
  serverTime!: string;
}
