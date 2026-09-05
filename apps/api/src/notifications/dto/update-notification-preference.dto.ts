import { IsBoolean, IsIn } from 'class-validator';

export class UpdateNotificationPreferenceDto {
  @IsIn(['EMAIL', 'LINE'])
  channel!: 'EMAIL' | 'LINE';

  @IsBoolean()
  isEnabled!: boolean;
}
