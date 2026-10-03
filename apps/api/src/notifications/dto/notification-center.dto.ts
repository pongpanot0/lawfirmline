import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

export class UpdateChannelSwitchesDto {
  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @IsOptional()
  @IsBoolean()
  line?: boolean;
}
