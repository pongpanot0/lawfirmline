import {
  IsNumber,
  IsOptional,
  IsString,
  ArrayMinSize,
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
  ExpenseClaimStatus,
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

  /**
   * Set when this cost was already covered by cash the owner advanced —
   * the expense is recorded as settled immediately and never enters the
   * claim/reimbursement queue.
   */
  @IsOptional()
  @IsUUID()
  paidFromAdvanceId?: string;
}

export class IssueCashAdvanceDto {
  @IsUUID()
  userId!: string;

  @Type(() => Number)
  @IsNumber(money)
  @Min(MONEY_MIN)
  @Max(MONEY_MAX)
  amount!: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateExpenseStatusDto {
  @IsEnum(ExpenseStatus)
  status!: ExpenseStatus;
}

export class UpdateExpenseClaimStatusDto {
  @IsIn([
    ExpenseClaimStatus.APPROVED,
    ExpenseClaimStatus.PAID,
    ExpenseClaimStatus.REJECTED,
  ])
  status!:
    | ExpenseClaimStatus.APPROVED
    | ExpenseClaimStatus.PAID
    | ExpenseClaimStatus.REJECTED;
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

/** ผู้จ่ายหนึ่งรายและสัดส่วนที่รับผิดชอบ — หนึ่งรายคือหนึ่งใบแจ้งหนี้ */
export class InvoiceSplitDto {
  @IsUUID()
  customerId!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  sharePercent!: number;
}

export class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  /** ลูกค้าที่วางบิล — ค่าว่างจะใช้ลูกค้าหลักของคดี */
  @IsOptional()
  @IsUUID()
  billToCustomerId?: string;

  /**
   * แบ่งบิลให้ผู้จ่ายหลายราย — ไม่ส่งมาจะใช้ลูกค้าของคดีตามสัดส่วนที่บันทึกไว้
   * ส่ง billToCustomerId มาด้วยกันไม่ได้ เพราะขัดกันเอง
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceSplitDto)
  splits?: InvoiceSplitDto[];

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  lineItems!: InvoiceLineItemDto[];
}
