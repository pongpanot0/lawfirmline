import { IsBoolean, IsEnum } from 'class-validator';
import { NotificationChannel } from '../../generated/prisma';

export class UpdateNotificationPreferenceDto {
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsBoolean()
  isEnabled!: boolean;
}
