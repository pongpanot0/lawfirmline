import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import {
  CreateTimeEntryDto,
  CreateExpenseDto,
  CreateStandaloneExpenseDto,
  CreateInvoiceDto,
  UpdateExpenseStatusDto,
} from './dto/billing.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser, Role, ExpenseStatus } from '@lawfirm/shared';

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
  createStandaloneExpense(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStandaloneExpenseDto,
  ) {
    return this.billingService.createStandaloneExpense(user, dto);
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
  createExpense(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.billingService.createExpense(user, caseId, dto);
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
