import { IsDateString, IsEnum, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { SubscriptionPlan, SubscriptionStatus } from '../../generated/prisma';

export class UpdatePlatformFirmDto {
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

  @IsOptional()
  @IsEnum(SubscriptionPlan)
  subscriptionPlan?: SubscriptionPlan;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxUsers?: number;

  @IsOptional()
  @IsDateString()
  trialEndAt?: string;

  /** null = the firm's paid period never ends. */
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsDateString()
  currentPeriodEnd?: string | null;
}
