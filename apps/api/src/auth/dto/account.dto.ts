import { Transform } from 'class-transformer';
import { IsByteLength, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class UpdateAccountProfileDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;
}

export class ConfirmAccountPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  currentPassword!: string;
}

export class ChangeAccountPasswordDto extends ConfirmAccountPasswordDto {
  @IsString()
  @MinLength(8)
  @IsByteLength(8, 72)
  password!: string;
}
