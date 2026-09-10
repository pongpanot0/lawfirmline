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
import * as fs from 'fs';
import { BillingService } from './billing.service';
import {
  CreateTimeEntryDto,
  CreateExpenseDto,
  CreateStandaloneExpenseDto,
  CreateInvoiceDto,
  UpdateExpenseStatusDto,
  SubmitExpensesDto,
} from './dto/billing.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser, Role, ExpenseStatus } from '@lawfirm/shared';
import { buildContentDispositionHeader } from '../common/utils/sanitize-filename';
import { safeMimeType } from '../common/utils/safe-mime-type';

const RECEIPT_UPLOAD = FileInterceptor('receipt', { limits: { fileSize: 10 * 1024 * 1024 } });

@Controller()
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Get('petty-cash')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  getPettyCash(@CurrentUser() user: AuthUser) {
    return this.billingService.getPettyCashBalance(user.firmId);
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
  ) {
    return this.billingService.getAllExpenses(user, status);
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
    fs.createReadStream(file.path).pipe(res);
  }

  @Post('expenses/submit')
  submitExpenses(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitExpensesDto,
  ) {
    return this.billingService.submitExpensesForApproval(user, dto.expenseIds);
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
  getExpenses(@Param('caseId') caseId: string) {
    return this.billingService.getExpenses(caseId);
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

  @Post('cases/:caseId/billing/invoices')
  @UseGuards(CaseAccessGuard)
  createInvoice(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.billingService.createInvoice(user, caseId, dto);
  }
}
