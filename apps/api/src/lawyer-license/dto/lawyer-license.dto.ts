import { IsEnum, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { LawyerLicenseType } from '@lawfirm/shared';

/** Every field optional; null clears it, omitted leaves it as stored. */
export class UpdateLicenseDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lawyerLicenseNo?: string | null;

  @IsOptional()
  @IsEnum(LawyerLicenseType)
  lawyerLicenseType?: LawyerLicenseType | null;

  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'วันหมดอายุต้องเป็น YYYY-MM-DD' })
  lawyerLicenseExpiresAt?: string | null;
}
