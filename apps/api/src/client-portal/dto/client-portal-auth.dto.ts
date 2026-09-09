import { IsEmail, IsString, MinLength } from 'class-validator';

export class RequestPortalLinkDto {
  @IsEmail()
  email!: string;
}

export class VerifyPortalTokenDto {
  @IsString()
  token!: string;
}

export class PortalPasswordLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class SetPortalPasswordDto {
  @IsString()
  @MinLength(6)
  password!: string;
}
