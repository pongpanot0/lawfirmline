import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { BillingService } from './billing.service';
import { CashAdvanceService } from './cash-advance.service';
import { CollectionsService } from './collections.service';
import { TimeSuggestionsService } from './time-suggestions.service';
import {
  CreateTimeEntryDto,
  UpdateTimeEntryDto,
  CreateExpenseDto,
  CreateStandaloneExpenseDto,
  CreateInvoiceDto,
  UpdateExpenseStatusDto,
  SetExpenseBillableDto,
  UpdateExpenseClaimStatusDto,
  SubmitExpensesDto,
  IssueCashAdvanceDto,
  ReturnCashAdvanceDto,
  SettleCashAdvanceDto,
  CashAdvanceReconciliationDto,
  UpdateExpenseReceiptNoDto,
  RecordPaymentDto,
  CollectionFollowUpDto,
  WriteOffDto,
  SetInvoiceDiscountDto,
  ConfirmTimeEntriesDto,
} from './dto/billing.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser, ExpenseStatus, ExpenseClaimStatus } from '@lawfirm/shared';
import { buildContentDispositionHeader } from '../common/utils/sanitize-filename';
import { safeMimeType } from '../common/utils/safe-mime-type';
import { FileStorageService } from '../common/services/file-storage.service';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { RequireCapability } from '../saas/decorators/saas.decorators';

const RECEIPT_UPLOAD = FileInterceptor('receipt', { limits: { fileSize: 10 * 1024 * 1024 } });

@Controller()
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(
    private billingService: BillingService,
    private fileStorage: FileStorageService,
    private cashAdvanceService: CashAdvanceService,
    private collectionsService: CollectionsService,
    private timeSuggestionsService: TimeSuggestionsService,
  ) {}

  @Get('time-entries/default-rate')
  async getDefaultTimeRate(@CurrentUser() user: AuthUser) {
    return { rate: await this.billingService.resolveDefaultRate(user.firmId, user.id) };
  }

  @Get('time-entries/suggestions')
  getTimeSuggestions(@CurrentUser() user: AuthUser, @Query('date') date: string) {
    return this.timeSuggestionsService.suggest(user, date);
  }

  @Post('time-entries/confirm')
  confirmTimeEntries(@CurrentUser() user: AuthUser, @Body() dto: ConfirmTimeEntriesDto) {
    return this.timeSuggestionsService.confirm(user, dto.entries);
  }

  @Get('time-entries')
  getFirmTimesheet(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('userId') userId?: string,
  ) {
    return this.timeSuggestionsService.timesheet(user, { from, to, userId });
  }

  @Get('petty-cash')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('viewPettyCash')
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

  @Get('cash-advances/reconciliation')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('issueCashAdvance')
  reconcileCashAdvances(@CurrentUser() user: AuthUser, @Query() filters: CashAdvanceReconciliationDto) {
    return this.cashAdvanceService.reconciliation(user, filters);
  }

  @Post('cash-advances/:id/return')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('issueCashAdvance')
  returnCashAdvance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReturnCashAdvanceDto,
  ) {
    return this.cashAdvanceService.recordReturn(user, id, dto.amount, dto.note);
  }

  @Post('cash-advances/:id/settle')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('issueCashAdvance')
  settleCashAdvance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SettleCashAdvanceDto,
  ) {
    return this.cashAdvanceService.settle(user, id, dto.note);
  }

  @Get('cash-advances/:id/expenses')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('issueCashAdvance')
  listCashAdvanceExpenses(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.cashAdvanceService.listExpenses(user, id);
  }

  @Get('finance/summary')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageInvoices')
  getFinanceSummary(@CurrentUser() user: AuthUser) {
    return this.billingService.getFinanceSummary(user);
  }

  @Get('invoices')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageInvoices')
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

  @Patch('expenses/:expenseId/receipt-no')
  updateExpenseReceiptNo(
    @CurrentUser() user: AuthUser,
    @Param('expenseId') expenseId: string,
    @Body() dto: UpdateExpenseReceiptNoDto,
  ) {
    return this.billingService.updateExpenseReceiptNo(user, expenseId, dto.officialReceiptNo);
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
  @UseGuards(FirmRoleGuard)
  @RequireCapability('approveExpenses')
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

  @Patch('expenses/:expenseId/write-off')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageInvoices')
  writeOffExpense(
    @CurrentUser() user: AuthUser,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: WriteOffDto,
  ) {
    return this.billingService.writeOffExpense(user, expenseId, dto.reason);
  }

  @Delete('expenses/:expenseId/write-off')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageInvoices')
  undoExpenseWriteOff(@CurrentUser() user: AuthUser, @Param('expenseId', ParseUUIDPipe) expenseId: string) {
    return this.billingService.undoExpenseWriteOff(user, expenseId);
  }

  @Patch('expenses/:expenseId/status')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('approveExpenses')
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

  @Patch('cases/:caseId/billing/time-entries/:entryId')
  @UseGuards(CaseAccessGuard)
  updateTimeEntry(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: UpdateTimeEntryDto,
  ) {
    return this.billingService.updateTimeEntry(user, caseId, entryId, dto);
  }

  @Delete('cases/:caseId/billing/time-entries/:entryId')
  @UseGuards(CaseAccessGuard)
  deleteTimeEntry(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ) {
    return this.billingService.deleteTimeEntry(user, caseId, entryId);
  }

  @Patch('cases/:caseId/billing/time-entries/:entryId/write-off')
  @UseGuards(CaseAccessGuard, FirmRoleGuard)
  @RequireCapability('manageInvoices')
  writeOffTimeEntry(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: WriteOffDto,
  ) {
    return this.billingService.writeOffTimeEntry(user, caseId, entryId, dto.reason);
  }

  @Delete('cases/:caseId/billing/time-entries/:entryId/write-off')
  @UseGuards(CaseAccessGuard, FirmRoleGuard)
  @RequireCapability('manageInvoices')
  undoTimeEntryWriteOff(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ) {
    return this.billingService.undoTimeEntryWriteOff(user, caseId, entryId);
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
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageInvoices')
  getStandaloneInvoices(@CurrentUser() user: AuthUser) {
    return this.billingService.getStandaloneInvoices(user);
  }

  @Post('invoices')
  createStandaloneInvoice(@CurrentUser() user: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.billingService.createInvoice(user, {}, dto);
  }

  @Get('invoices/receivables')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageInvoices')
  getReceivables(@CurrentUser() user: AuthUser) {
    return this.collectionsService.getReceivables(user);
  }

  @Get('invoices/:invoiceId/print-data')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageInvoices')
  getInvoicePrintData(@CurrentUser() user: AuthUser, @Param('invoiceId') invoiceId: string) {
    return this.billingService.getInvoicePrintData(user, invoiceId);
  }

  @Patch('invoices/:invoiceId/send')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageInvoices')
  markInvoiceSent(@CurrentUser() user: AuthUser, @Param('invoiceId') invoiceId: string) {
    return this.collectionsService.markSent(user, invoiceId);
  }

  @Post('invoices/:invoiceId/payments')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageInvoices')
  recordInvoicePayment(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.collectionsService.recordPayment(user, invoiceId, dto);
  }

  @Get('invoices/:invoiceId/payments')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageInvoices')
  listInvoicePayments(@CurrentUser() user: AuthUser, @Param('invoiceId') invoiceId: string) {
    return this.collectionsService.listPayments(user, invoiceId);
  }

  @Post('invoices/:invoiceId/remind')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageInvoices')
  sendInvoiceReminder(@CurrentUser() user: AuthUser, @Param('invoiceId') invoiceId: string) {
    return this.collectionsService.sendReminder(user, invoiceId);
  }

  @Patch('invoices/:invoiceId/discount')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageInvoices')
  setInvoiceDiscount(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: SetInvoiceDiscountDto,
  ) {
    return this.billingService.setInvoiceDiscount(user, invoiceId, dto);
  }

  @Get('invoices/owner-worklist')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageInvoices')
  ownerWorklist(@CurrentUser() user: AuthUser, @Query('month') month?: string) {
    return this.collectionsService.ownerWorklist(user, month);
  }

  @Get('invoices/:invoiceId/collection')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageInvoices')
  collectionInvoice(@CurrentUser() user: AuthUser, @Param('invoiceId', ParseUUIDPipe) invoiceId: string) {
    return this.collectionsService.getInvoice(user, invoiceId);
  }

  @Patch('invoices/:invoiceId/follow-up')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageInvoices')
  collectionFollowUp(@CurrentUser() user: AuthUser, @Param('invoiceId', ParseUUIDPipe) invoiceId: string, @Body() dto: CollectionFollowUpDto) {
    return this.collectionsService.setFollowUp(user, invoiceId, dto);
  }
}
