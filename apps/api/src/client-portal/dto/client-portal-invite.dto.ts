import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePortalInviteDto {
  @IsString()
  @IsNotEmpty()
  clientContactId!: string;
}
