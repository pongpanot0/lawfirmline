import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

const Trim = () => Transform(({ value }) => typeof value === 'string' ? value.trim() : value);

export class LogClientContactDto {
  @IsUUID()
  caseId!: string;

  @IsUUID()
  contactId!: string;

  @IsUUID()
  recipientUserId!: string;

  @IsIn(['INBOUND_CALL', 'OUTBOUND_CALL', 'EMAIL', 'LINE', 'MEETING'])
  channel!: 'INBOUND_CALL' | 'OUTBOUND_CALL' | 'EMAIL' | 'LINE' | 'MEETING';

  @IsBoolean()
  reached!: boolean;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  followupTitle?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  followupDueDate?: string;
}
