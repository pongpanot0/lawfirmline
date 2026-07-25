import { IsEmail, IsString } from 'class-validator';

export class RequestPortalLinkDto {
  @IsEmail()
  email!: string;
}

export class VerifyPortalTokenDto {
  @IsString()
  token!: string;
}
