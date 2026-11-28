import { ApiProperty } from "@nestjs/swagger";

export class AuthUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true })
  displayName!: string | null;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  hasPlatformAccess!: boolean;
}

export class AuthSessionResponseDto {
  @ApiProperty({ type: String, format: "date-time" })
  serverTime!: string;

  @ApiProperty({ type: String, format: "date-time" })
  reauthDueAt!: string;

  @ApiProperty({ type: String, format: "date-time" })
  hardExpiresAt!: string;

  @ApiProperty({ type: String, format: "date-time" })
  expiresAt!: string;

  @ApiProperty({ type: "integer", minimum: 1 })
  idleTimeoutSeconds!: number;

  @ApiProperty({ type: String, required: false })
  sessionId?: string;
}

export class AuthTokenResponseDto {
  @ApiProperty({ type: () => AuthSessionResponseDto, required: false })
  session?: AuthSessionResponseDto;

  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  accessTokenExpiresAt!: string;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}

export class SignupChallengeResponseDto {
  @ApiProperty({ example: "18 - 5" })
  question!: string;

  @ApiProperty()
  challengeToken!: string;

  @ApiProperty()
  expiresAt!: string;
}

export class MeResponseDto {
  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;
}

export class LogoutAllResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;

  @ApiProperty({ example: 2 })
  revokedSessions!: number;
}

export class ApiErrorResponseDto {
  @ApiProperty({
    example: {
      code: "AUTH_INVALID_CREDENTIALS",
      message: "Invalid email or password.",
    },
  })
  error!: {
    code: string;
    message: string;
  };
}
