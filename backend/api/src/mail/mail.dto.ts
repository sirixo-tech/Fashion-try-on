import {
  IsBoolean,
  IsEmail,
  IsFQDN,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  Matches,
  Max,
  MaxLength,
  Min,
  NotContains,
} from "class-validator";

export class SaveMailSettingsDto {
  @IsBoolean() @IsIn([true]) editConfirmed!: boolean;
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
export class SaveMailTemplateDto {
  @IsInt() @Min(0) version!: number;
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  @Matches(/^[^\r\n\0]+$/)
  @Matches(/\S/)
  subject!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  @NotContains(String.fromCharCode(0))
  @Matches(/\S/)
  body!: string;
}
export class SendCustomEmailDto extends SaveMailTemplateDto {
  @IsEmail() @MaxLength(320) recipient!: string;
  @IsUUID() idempotencyKey!: string;
}
export class SendTestEmailDto {
  @IsEmail() @MaxLength(320) recipient!: string;
  @IsInt() @Min(1) version!: number;
}
