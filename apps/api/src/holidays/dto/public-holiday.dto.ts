import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';

export class HolidayItemDto {
  /** Plain calendar day, `YYYY-MM-DD`. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsString()
  name!: string;
}

export class ReplaceYearDto {
  /** Gregorian or Buddhist year — both are accepted. */
  @IsInt()
  @Min(1900)
  @Max(2600)
  year!: number;

  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => HolidayItemDto)
  holidays!: HolidayItemDto[];
}
