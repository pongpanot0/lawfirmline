import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SendCaseEmailDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  to!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  cc?: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subject!: string;

  /** Plain text from the compose box — the service escapes it into HTML. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  documentIds?: string[];

  /** EmailMessage.id being answered — makes this a reply (Task 3). */
  @IsOptional()
  @IsUUID()
  replyToMessageId?: string;

  @IsOptional()
  @IsBoolean()
  replyAll?: boolean;

  /** Append the sender's saved email signature (default true). */
  @IsOptional()
  @IsBoolean()
  includeSignature?: boolean;

  /** One per compose window — a retried request with the same key is refused instead of sent twice. */
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;
}
