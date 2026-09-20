import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PHONE_HINT, PHONE_REGEX } from '@lawfirm/shared';

/** Trim incoming strings so "   " does not pass @IsNotEmpty. */
const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class ClientContactDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  nickname?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @Matches(PHONE_REGEX, { message: PHONE_HINT })
  phone?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  position?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  portalEnabled?: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateClientDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(50)
  taxId?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  branch?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  billingEmail?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(50)
  billingPhone?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientContactDto)
  contacts!: ClientContactDto[];
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(50)
  taxId?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  branch?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  billingEmail?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(50)
  billingPhone?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientContactDto)
  contacts?: ClientContactDto[];
}
