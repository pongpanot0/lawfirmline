import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { CargoReviewStatus } from '@lawfirm/shared';

export class UpsertCargoClaimDto {
  @IsOptional() @IsString() assuredName?: string;
  @IsOptional() @IsString() shipperName?: string;
  @IsOptional() @IsString() consigneeName?: string;
  @IsOptional() @IsString() contractingCarrierName?: string;
  @IsOptional() @IsString() actualCarrierName?: string;
  @IsOptional() @IsString() origin?: string;
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsString() transportMode?: string;
  @IsOptional() @IsString() transportDocumentNumber?: string;
  @IsOptional() @IsDateString() arrivalDate?: string | null;
  @IsOptional() @IsDateString() lossDate?: string | null;
  @IsOptional() @IsString() goodsDescription?: string;
  @IsOptional() @IsString() movementTerm?: string;
  @IsOptional() @IsString() damageDescription?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) damagedWeight?: number | null;
  @IsOptional() @IsString() weightUnit?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999) claimAmount?: number | null;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() applicableLaw?: string;
  @IsOptional() @IsString() jurisdiction?: string;
  @IsOptional() @IsString() liableParty?: string;
  @IsOptional() @IsString() liabilityLimit?: string;
  @IsOptional() @IsString() liabilityExclusion?: string;
  @IsOptional() @IsString() timeBarPeriod?: string;
  @IsOptional() @IsDateString() timeBarTriggerDate?: string | null;
  @IsOptional() @IsDateString() timeBarDeadline?: string | null;
  @IsOptional() @IsString() timeBarBasis?: string;
  @IsOptional() @IsString() quantumNotes?: string;
  @IsOptional() @IsString() recommendation?: string;
  @IsOptional() @IsString() opinion?: string;
  @IsOptional() @IsIn(['DRAFT', 'CONFIRMED'] satisfies CargoReviewStatus[]) reviewStatus?: CargoReviewStatus;
  @IsOptional() @IsBoolean() confirm?: boolean;
}

export class UpdateCargoRequirementDto {
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsIn(['REQUESTED', 'RECEIVED', 'MISSING', 'NOT_APPLICABLE']) status?: 'REQUESTED' | 'RECEIVED' | 'MISSING' | 'NOT_APPLICABLE';
  @IsOptional() @IsString() note?: string | null;
  @IsOptional() @IsUUID() documentId?: string | null;
}
