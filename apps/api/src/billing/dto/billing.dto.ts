import {
  IsNumber,
  IsOptional,
  IsString,
  ArrayMaxSize,
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
  ValidateIf,
  Matches,
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
import { PaymentMethod, TaxClass } from '../../generated/prisma';

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

export class UpdateTimeEntryDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(HOURS_MIN)
  @Max(HOURS_MAX)
  hours?: number;

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
}

export class CreateExpenseDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  officialReceiptNo?: string;

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

export class SettleCashAdvanceDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReturnCashAdvanceDto extends SettleCashAdvanceDto {
  @Type(() => Number)
  @IsNumber(money)
  @Min(MONEY_MIN)
  @Max(MONEY_MAX)
  amount!: number;
}

export class CashAdvanceReconciliationDto {
  @IsOptional()
  @IsIn(['open', 'settled'])
  status?: 'open' | 'settled';
}

export class UpdateExpenseReceiptNoDto {
  @ValidateIf((_object, value) => value !== null)
  @Trim()
  @IsString()
  @MaxLength(100)
  officialReceiptNo!: string | null;
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
  @IsOptional()
  @IsEnum(TaxClass, { message: 'เลือกประเภทภาษีที่ถูกต้อง' })
  taxClass?: TaxClass;

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

/** true = ผลักไปเก็บกับลูกค้า, false = สำนักงานออกเอง */
export class SetExpenseBillableDto {
  @IsBoolean()
  billable!: boolean;
}

export class CreateInvoiceDto {
  @IsOptional()
  @IsEnum(TaxClass, { message: 'เลือกประเภทภาษีค่าบริการที่ถูกต้อง' })
  feeTaxClass?: TaxClass;

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

  /** รายการที่พิมพ์เอง — เว้นได้ถ้าเก็บเงินจากงานในคดีล้วน ๆ */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  lineItems?: InvoiceLineItemDto[];

  /** ส่วนลดทั้งใบ — ยอดสุดท้ายคำนวณที่ server เสมอ */
  @IsOptional()
  @Type(() => Number)
  @IsNumber(money)
  @Min(0)
  @Max(MONEY_MAX)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  discountReason?: string;

  /** บันทึกเวลาในคดีที่จะเก็บเงินรอบนี้ — ราคาอ่านจาก DB ไม่เชื่อค่าที่ส่งมา */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  timeEntryIds?: string[];

  /** ค่าใช้จ่ายที่อนุมัติแล้วและจะผลักไปเก็บกับลูกค้า */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  expenseIds?: string[];
}

export class ConfirmTimeEntryDto {
  @IsUUID()
  caseId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.25)
  @Max(24)
  hours!: number;

  /** ว่าง = ใช้ FirmMember.defaultHourlyRate ของผู้ยืนยัน (ไม่ตั้งไว้ = 0) */
  @IsOptional()
  @IsNumber(money)
  @Min(0)
  @Max(MONEY_MAX)
  rate?: number;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceKey?: string;

  @IsOptional()
  @IsBoolean()
  billable?: boolean;
}

export class ConfirmTimeEntriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ConfirmTimeEntryDto)
  entries!: ConfirmTimeEntryDto[];
}

export class RecordPaymentDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber(money, { message: 'ระบุภาษีหัก ณ ที่จ่ายเป็นตัวเลขไม่เกิน 2 ตำแหน่ง' })
  @Min(0, { message: 'ภาษีหัก ณ ที่จ่ายต้องไม่ติดลบ' })
  @Max(MONEY_MAX, { message: 'ภาษีหัก ณ ที่จ่ายเกินวงเงิน กรุณาลดยอด' })
  whtAmount?: number;

  @IsOptional()
  @IsNumber({}, { message: 'ระบุอัตราภาษีเป็นตัวเลข เช่น 0.03' })
  @Min(0, { message: 'อัตราภาษีต้องไม่ติดลบ' })
  @Max(1, { message: 'ระบุอัตราภาษีไม่เกิน 1 เช่น 0.03' })
  whtRate?: number | null;

  @IsOptional()
  @Trim()
  @IsString({ message: 'ระบุเลขหนังสือรับรองเป็นข้อความ' })
  @MaxLength(120, { message: 'เลขหนังสือรับรองต้องไม่เกิน 120 ตัวอักษร' })
  whtCertificateNo?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  createRequestId?: string;

  @Type(() => Number)
  @IsNumber(money)
  @Min(0.01)
  @Max(MONEY_MAX)
  amount!: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  receivedAt!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CollectionFollowUpDto {
  @IsDateString()
  updatedAt!: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsUUID()
  ownerId?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  nextAt?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Trim()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class WriteOffDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class SetInvoiceDiscountDto {
  @Type(() => Number)
  @IsNumber(money)
  @Min(0)
  @Max(MONEY_MAX)
  discountAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  discountReason?: string;
}

export class ClearChequeDto {
  @IsDateString({ strict: true }, { message: 'ระบุวันที่เช็คผ่านที่ถูกต้อง' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'ระบุวันที่เช็คผ่านเป็น YYYY-MM-DD' })
  clearedAt!: string;
}

export class VoidReceiptDto {
  @Trim()
  @IsString({ message: 'ระบุเหตุผลยกเลิก' })
  @IsNotEmpty({ message: 'ระบุเหตุผลยกเลิก' })
  @MaxLength(500, { message: 'เหตุผลต้องไม่เกิน 500 ตัวอักษร' })
  reason!: string;
}

export class BillingProfileDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Trim()
  @IsString({ message: 'ระบุชื่อจดทะเบียนเป็นข้อความ' })
  @MaxLength(500, { message: 'ชื่อต้องไม่เกิน 500 ตัวอักษร' })
  legalName?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== '')
  @Matches(/^\d{13}$/, { message: 'ระบุเลขประจำตัวผู้เสียภาษี 13 หลัก' })
  taxId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Trim()
  @IsString({ message: 'ระบุรหัสสาขาเป็นข้อความ' })
  @MaxLength(20, { message: 'รหัสสาขาต้องไม่เกิน 20 ตัวอักษร' })
  taxBranch?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Trim()
  @IsString({ message: 'ระบุที่อยู่ออกบิลเป็นข้อความ' })
  @MaxLength(2000, { message: 'ที่อยู่ต้องไม่เกิน 2000 ตัวอักษร' })
  billingAddress?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean({ message: 'เลือกสถานะจดทะเบียน VAT เป็น true หรือ false' })
  vatRegistered?: boolean;
}
