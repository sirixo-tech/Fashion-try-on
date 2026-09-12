import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class SignupDto {
  @ApiProperty({ example: "Asha Merchant", maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  displayName!: string;

  @ApiProperty({ example: "asha@example.com" })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ minLength: 12, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  password!: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @MaxLength(2048)
  challengeToken!: string;

  @ApiProperty({ example: "13", writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(12)
  challengeAnswer!: string;
}
