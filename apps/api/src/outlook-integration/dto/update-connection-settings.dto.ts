import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateConnectionSettingsDto {
  @IsOptional() @IsBoolean() syncInboxToIntake?: boolean;
  @IsOptional() @IsBoolean() syncCalendar?: boolean;
}
