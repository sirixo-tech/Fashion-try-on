import {
  IsBoolean,
  IsEmail,
  IsFQDN,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  NotContains,
} from "class-validator";

export class SaveMailSettingsDto {
  @IsInt() @Min(0) version!: number;
  @IsBoolean() enabled!: boolean;
  @IsFQDN() @MaxLength(253) host!: string;
  @IsInt() @Min(1) @Max(65535) port!: number;
  @IsIn(["STARTTLS", "TLS"]) security!: "STARTTLS" | "TLS";
  @IsString()
  @MaxLength(320)
  @Matches(/^[^\r\n]+$/)
  @NotContains(String.fromCharCode(0))
  username!: string;
  @IsOptional() @IsString() @MaxLength(1024) password?: string;
  @IsEmail() @MaxLength(320) fromEmail!: string;
  @IsString()
  @MaxLength(120)
  @Matches(/^[^\r\n]+$/)
  @NotContains(String.fromCharCode(0))
  fromName!: string;
  @IsOptional() @IsEmail() @MaxLength(320) replyTo?: string;
}
export class SendTestEmailDto {
  @IsEmail() @MaxLength(320) recipient!: string;
  @IsInt() @Min(1) version!: number;
}
