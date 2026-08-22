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

export class AuthTokenResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  accessTokenExpiresAt!: string;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
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
