import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { FirmRole, SubscriptionPlan } from '../../generated/prisma';

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsEnum(FirmRole)
  role?: FirmRole;
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

export class CheckoutDto {
  @IsEnum(SubscriptionPlan)
  plan!: SubscriptionPlan;

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
}
