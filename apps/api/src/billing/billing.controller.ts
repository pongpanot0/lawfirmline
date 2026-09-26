import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { BillingService } from './billing.service';
import { CashAdvanceService } from './cash-advance.service';
import { CollectionsService } from './collections.service';
import {
  CreateTimeEntryDto,
  CreateExpenseDto,
  CreateStandaloneExpenseDto,
  CreateInvoiceDto,
  UpdateExpenseStatusDto,
  SetExpenseBillableDto,
  UpdateExpenseClaimStatusDto,
  SubmitExpensesDto,
  IssueCashAdvanceDto,
  RecordPaymentDto,
} from './dto/billing.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser, Role, ExpenseStatus, ExpenseClaimStatus } from '@lawfirm/shared';
import { buildContentDispositionHeader } from '../common/utils/sanitize-filename';
import { safeMimeType } from '../common/utils/safe-mime-type';
import { FileStorageService } from '../common/services/file-storage.service';

const RECEIPT_UPLOAD = FileInterceptor('receipt', { limits: { fileSize: 10 * 1024 * 1024 } });

@Controller()
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(
    private billingService: BillingService,
    private fileStorage: FileStorageService,
    private cashAdvanceService: CashAdvanceService,
    private collectionsService: CollectionsService,
  ) {}

  @Get('petty-cash')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  getPettyCash(@CurrentUser() user: AuthUser) {
    return this.billingService.getPettyCashBalance(user.firmId);
  }

  @Post('cash-advances')
  issueCashAdvance(@CurrentUser() user: AuthUser, @Body() dto: IssueCashAdvanceDto) {
    return this.cashAdvanceService.issue(user, dto);
  }

  @Get('cash-advances')
  listCashAdvances(@CurrentUser() user: AuthUser, @Query('userId') userId?: string) {
    return this.cashAdvanceService.list(user, userId);
  }

  @Get('cash-advances/mine')
  listMyCashAdvances(@CurrentUser() user: AuthUser) {
    return this.cashAdvanceService.listMineWithBalance(user);
  }

  @Get('finance/summary')
  getFinanceSummary(@CurrentUser() user: AuthUser) {
    return this.billingService.getFinanceSummary(user);
  }

  @Get('invoices')
  getFirmInvoices(@CurrentUser() user: AuthUser) {
    return this.billingService.getFirmInvoices(user);
  }

  @Get('expenses')
  getAllExpenses(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: ExpenseStatus,
    @Query('userId') userId?: string,
  ) {
    return this.billingService.getAllExpenses(user, { status, userId });
  }

  @Post('expenses')
  @UseInterceptors(RECEIPT_UPLOAD)
  createStandaloneExpense(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStandaloneExpenseDto,
    @UploadedFile() receipt?: Express.Multer.File,
  ) {
    return this.billingService.createStandaloneExpense(user, dto, receipt);
  }

  @Get('expenses/:expenseId/receipt')
  async downloadReceipt(
    @CurrentUser() user: AuthUser,
    @Param('expenseId') expenseId: string,
    @Res() res: Response,
  ) {
    const file = await this.billingService.getReceiptFile(user, expenseId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', safeMimeType(file.mimeType));
    res.setHeader('Content-Disposition', buildContentDispositionHeader(file.filename));
    const stream = await this.fileStorage.openDownloadStream(file.path);
    stream.pipe(res);
  }

  @Post('expenses/submit')
  submitExpenses(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitExpensesDto,
  ) {
    return this.billingService.submitExpensesForApproval(user, dto.expenseIds);
  }

  @Get('expense-claims')
  getExpenseClaims(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: ExpenseClaimStatus,
    @Query('userId') userId?: string,
  ) {
    return this.billingService.getExpenseClaims(user, { status, userId });
  }

  @Get('expense-claims/:claimId')
  getExpenseClaim(
    @CurrentUser() user: AuthUser,
    @Param('claimId') claimId: string,
  ) {
    return this.billingService.getExpenseClaim(user, claimId);
  }

  @Patch('expense-claims/:claimId/status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  updateExpenseClaimStatus(
    @CurrentUser() user: AuthUser,
    @Param('claimId') claimId: string,
    @Body() dto: UpdateExpenseClaimStatusDto,
  ) {
    return this.billingService.updateExpenseClaimStatus(user, claimId, dto);
  }

  @Patch('expenses/:expenseId/billable')
  setExpenseBillable(
    @CurrentUser() user: AuthUser,
    @Param('expenseId') expenseId: string,
    @Body() dto: SetExpenseBillableDto,
  ) {
    return this.billingService.setExpenseBillable(user, expenseId, dto.billable);
  }

  @Patch('expenses/:expenseId/status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  updateExpenseStatus(
    @CurrentUser() user: AuthUser,
    @Param('expenseId') expenseId: string,
    @Body() dto: UpdateExpenseStatusDto,
  ) {
    return this.billingService.updateExpenseStatus(user, expenseId, dto);
  }

  @Get('cases/:caseId/billing/summary')
  @UseGuards(CaseAccessGuard)
  getExpenseSummary(@Param('caseId') caseId: string) {
    return this.billingService.getExpenseSummary(caseId);
  }

  @Get('cases/:caseId/billing/time-entries')
  @UseGuards(CaseAccessGuard)
  getTimeEntries(@Param('caseId') caseId: string) {
    return this.billingService.getTimeEntries(caseId);
  }

  @Post('cases/:caseId/billing/time-entries')
  @UseGuards(CaseAccessGuard)
  createTimeEntry(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateTimeEntryDto,
  ) {
    return this.billingService.createTimeEntry(user, caseId, dto);
  }

  @Get('cases/:caseId/billing/expenses')
  @UseGuards(CaseAccessGuard)
  getExpenses(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.billingService.getExpenses(user, caseId);
  }

  @Post('cases/:caseId/billing/expenses')
  @UseGuards(CaseAccessGuard)
  @UseInterceptors(RECEIPT_UPLOAD)
  createExpense(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateExpenseDto,
    @UploadedFile() receipt?: Express.Multer.File,
  ) {
    return this.billingService.createExpense(user, caseId, dto, receipt);
  }

  @Get('cases/:caseId/billing/invoices')
  @UseGuards(CaseAccessGuard)
  getInvoices(@Param('caseId') caseId: string) {
    return this.billingService.getInvoices(caseId);
  }

  @Get('cases/:caseId/billing/invoices/draft')
  @UseGuards(CaseAccessGuard)
  getInvoiceDraft(@Param('caseId') caseId: string) {
    return this.billingService.getInvoiceDraft(caseId);
  }

  @Post('cases/:caseId/billing/invoices')
  @UseGuards(CaseAccessGuard)
  createInvoice(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.billingService.createInvoice(user, { caseId }, dto);
  }

  @Get('intakes/:intakeId/billing/invoices')
  async getIntakeInvoices(@CurrentUser() user: AuthUser, @Param('intakeId') intakeId: string) {
    await this.billingService.assertIntakeAccess(user, intakeId);
    return this.billingService.getIntakeInvoices(intakeId);
  }

  @Post('intakes/:intakeId/billing/invoices')
  async createIntakeInvoice(
    @CurrentUser() user: AuthUser,
    @Param('intakeId') intakeId: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    await this.billingService.assertIntakeAccess(user, intakeId);
    return this.billingService.createInvoice(user, { intakeId }, dto);
  }

  /** ใบที่ออกเปล่า ให้ลูกค้าดูก่อนจะมีคดีหรือเรื่อง */
  @Get('invoices/standalone')
  getStandaloneInvoices(@CurrentUser() user: AuthUser) {
    return this.billingService.getStandaloneInvoices(user);
  }

  @Post('invoices')
  createStandaloneInvoice(@CurrentUser() user: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.billingService.createInvoice(user, {}, dto);
  }

  @Get('invoices/receivables')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  getReceivables(@CurrentUser() user: AuthUser) {
    return this.collectionsService.getReceivables(user);
  }

  @Get('invoices/:invoiceId/print-data')
  getInvoicePrintData(@CurrentUser() user: AuthUser, @Param('invoiceId') invoiceId: string) {
    return this.billingService.getInvoicePrintData(user, invoiceId);
  }

  @Patch('invoices/:invoiceId/send')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  markInvoiceSent(@CurrentUser() user: AuthUser, @Param('invoiceId') invoiceId: string) {
    return this.collectionsService.markSent(user, invoiceId);
  }

  @Post('invoices/:invoiceId/payments')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  recordInvoicePayment(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.collectionsService.recordPayment(user, invoiceId, dto);
  }

  @Get('invoices/:invoiceId/payments')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  listInvoicePayments(@CurrentUser() user: AuthUser, @Param('invoiceId') invoiceId: string) {
    return this.collectionsService.listPayments(user, invoiceId);
  }
}
