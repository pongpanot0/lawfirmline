import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CloseCaseDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'สรุปคดีต้องมีอย่างน้อย 10 ตัวอักษร' })
  closingSummary!: string;
}
