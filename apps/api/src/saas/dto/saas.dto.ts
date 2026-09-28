import { IsEmail, IsEnum, IsOptional, IsString, MinLength, Matches, Length } from 'class-validator';
import { FirmRole } from '@lawfirm/shared';
import { BillingPeriod, SubscriptionPlan } from '../../generated/prisma';
import { Transform } from 'class-transformer';

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsEnum(FirmRole)
  role?: FirmRole;
}

export class UpdateMemberRoleDto {
  @IsEnum(FirmRole)
  role!: FirmRole;
}

export class AcceptInviteDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(2)
  firstName!: string;

  @IsString()
  @MinLength(2)
  lastName!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class OpenJoinDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  firstName!: string;

  @IsString()
  @MinLength(2)
  lastName!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class CheckoutDto {
  @IsEnum(SubscriptionPlan)
  plan!: SubscriptionPlan;

  @IsOptional()
  @IsEnum(BillingPeriod)
  billingPeriod?: BillingPeriod;

  @IsOptional()
  @IsString()
  omiseToken?: string;

  @IsOptional()
  @IsString()
  omiseSource?: string;
}

export class PromptPayCheckoutDto {
  @IsEnum(SubscriptionPlan)
  plan!: SubscriptionPlan;

  @IsOptional()
  @IsEnum(BillingPeriod)
  billingPeriod?: BillingPeriod;
}

export class UpdateFirmSettingsDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Length(1, 12, { message: 'Prefix must be 1-12 characters' })
  @Matches(/^[A-Z0-9\-]+$/, { message: 'Prefix must contain only uppercase letters, numbers, and hyphens' })
  ownRefPrefix?: string;
}
