import {
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  IsDateString,
  IsArray,
  IsEnum,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseStatus } from '@lawfirm/shared';

export class CreateTimeEntryDto {
  @IsNumber()
  hours!: number;

  @IsOptional()
  @IsNumber()
  rate?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsBoolean()
  billable?: boolean;
}

export class CreateExpenseDto {
  @IsNumber()
  amount!: number;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  expensePurpose?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}

export class CreateStandaloneExpenseDto extends CreateExpenseDto {
  @IsOptional()
  @IsUUID()
  caseId?: string;
}

export class UpdateExpenseStatusDto {
  @IsEnum(ExpenseStatus)
  status!: ExpenseStatus;
}

export class InvoiceLineItemDto {
  @IsString()
  description!: string;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  unitPrice!: number;
}

export class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  lineItems!: InvoiceLineItemDto[];
}
