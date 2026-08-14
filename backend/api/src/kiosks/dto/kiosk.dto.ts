import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from "class-validator";

import {
  KioskAssignmentScope,
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
  revokedAt!: string | null;
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
