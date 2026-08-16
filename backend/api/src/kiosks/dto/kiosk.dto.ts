import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEnum,
  IsIn,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

import {
  KioskConfigurationAssetType,
  KioskConfigurationGarmentIntent,
  KioskConfigurationSoundProfile,
  KioskAssignmentScope,
  KioskCustomerUploadPurpose,
  KioskCustomerUploadSessionStatus,
  KioskDeviceStatus,
  KioskIdleMode,
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

export class KioskConfigurationAssetDto {
  id!: string;
  type!: KioskConfigurationAssetType;
  label!: string;
  url!: string | null;
  bundledAssetKey!: string | null;
  assetRef!: string | null;
  contentType!: string | null;
  sizeBytes!: number | null;
  sortOrder!: number;
}

export class KioskConfigurationDto {
  version!: number;
  display!: {
    idleMode: KioskIdleMode;
    slideDurationSeconds: number;
    title: string | null;
    subtitle: string | null;
    ctaLabel: string;
    assets: KioskConfigurationAssetDto[];
  };
  capture!: {
    countdownSeconds: number;
    soundEnabled: boolean;
    soundProfile: KioskConfigurationSoundProfile;
    guidanceAudioEnabled: boolean;
  };
  experience!: {
    enabledGarmentIntents: KioskConfigurationGarmentIntent[];
    sessionIdleTimeoutSeconds: number;
  };
  assetUpload!: {
    supported: boolean;
    maxImageBytes: number;
    supportedContentTypes: string[];
  };
  updatedAt!: string;
}

export class KioskConfigurationAssetInputDto {
  @IsEnum(KioskConfigurationAssetType)
  type!: KioskConfigurationAssetType;

  @IsString()
  @Length(1, 120)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bundledAssetKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(700)
  assetRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contentType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12 * 1024 * 1024)
  sizeBytes?: number;
}

export class CreateKioskConfigurationAssetUploadDto {
  @IsString()
  @MaxLength(80)
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(12 * 1024 * 1024)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  fileName?: string;
}

export class KioskConfigurationAssetUploadIntentDto {
  assetRef!: string;
  type!: KioskConfigurationAssetType;
  label!: string;
  uploadUrl!: string;
  method!: "PUT";
  expiresAt!: string;
  headers!: Record<string, string>;
  maxImageBytes!: number;
  supportedContentTypes!: string[];
}

export class KioskConfigurationDisplayInputDto {
  @IsEnum(KioskIdleMode)
  idleMode!: KioskIdleMode;

  @IsInt()
  @Min(3)
  @Max(60)
  slideDurationSeconds!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  subtitle?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  ctaLabel?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => KioskConfigurationAssetInputDto)
  assets!: KioskConfigurationAssetInputDto[];
}

export class KioskConfigurationCaptureInputDto {
  @IsInt()
  @IsIn([5, 10, 15])
  countdownSeconds!: number;

  @IsBoolean()
  soundEnabled!: boolean;

  @IsEnum(KioskConfigurationSoundProfile)
  soundProfile!: KioskConfigurationSoundProfile;

  @IsBoolean()
  guidanceAudioEnabled!: boolean;
}

export class KioskConfigurationExperienceInputDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsEnum(KioskConfigurationGarmentIntent, { each: true })
  enabledGarmentIntents!: KioskConfigurationGarmentIntent[];

  @IsInt()
  @Min(30)
  @Max(900)
  sessionIdleTimeoutSeconds!: number;
}

export class UpdateKioskConfigurationDto {
  @ValidateNested()
  @Type(() => KioskConfigurationDisplayInputDto)
  display!: KioskConfigurationDisplayInputDto;

  @ValidateNested()
  @Type(() => KioskConfigurationCaptureInputDto)
  capture!: KioskConfigurationCaptureInputDto;

  @ValidateNested()
  @Type(() => KioskConfigurationExperienceInputDto)
  experience!: KioskConfigurationExperienceInputDto;
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
  latestConfigurationVersion!: number;
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
  purpose!: KioskCustomerUploadPurpose;
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
  purpose!: KioskCustomerUploadPurpose;
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
  purpose!: KioskCustomerUploadPurpose;
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
  purpose!: KioskCustomerUploadPurpose;
  expiresAt!: string;
  serverTime!: string;
}
