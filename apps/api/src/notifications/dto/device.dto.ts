import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token!: string;

  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';
}
