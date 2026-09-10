import {
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsDateString,
  IsArray,
  IsEnum,
  IsIn,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  ExpenseStatus,
  HOURS_MAX,
  HOURS_MIN,
  MONEY_MAX,
  MONEY_MIN,
} from '@lawfirm/shared';

/** Trim incoming strings so "   " does not pass @IsNotEmpty. */
const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

const money = { maxDecimalPlaces: 2 } as const;

export class CreateTimeEntryDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(HOURS_MIN)
  @Max(HOURS_MAX)
  hours!: number;

  @IsOptional()
  @IsNumber(money)
  @Min(0)
  @Max(MONEY_MAX)
  rate?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsBoolean()
  billable?: boolean;
}

export class CreateExpenseDto {
  @Type(() => Number)
  @IsNumber(money)
  @Min(MONEY_MIN)
  @Max(MONEY_MAX)
  amount!: number;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  expensePurpose?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  /**
   * The hearing this cost came from, so a reimbursement can be traced back to
   * the trip that caused it.
   */
  @IsOptional()
  @IsUUID()
  sourceEventId?: string;

  /**
   * `DRAFT` records the cost without claiming it. Omitted means `PENDING`,
   * which is a claim — the existing behaviour of every caller.
   */
  @IsOptional()
  @IsIn([ExpenseStatus.DRAFT, ExpenseStatus.PENDING])
  status?: ExpenseStatus.DRAFT | ExpenseStatus.PENDING;
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

export class SubmitExpensesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  expenseIds!: string[];
}

export class InvoiceLineItemDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  quantity!: number;

  @IsNumber(money)
  @Min(0)
  @Max(MONEY_MAX)
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
