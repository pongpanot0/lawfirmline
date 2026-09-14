import { IsString, Length } from 'class-validator';

export class VerifyMfaLoginDto {
  @IsString()
  mfaToken!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}

export class MfaCodeDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class DisableMfaDto {
  @IsString()
  password!: string;
}
