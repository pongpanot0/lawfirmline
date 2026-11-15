import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { RequireCapability } from '../saas/decorators/saas.decorators';
import { FeePackagesService } from './fee-packages.service';
import { CloseOutFeeDto, CreateFeePackageDto, FeePackageQueryDto, PreviewFeePackageDto, SetCaseFeeDto, UpdateFeePackageDto } from './dto/fee-packages.dto';

@Controller()
@UseGuards(JwtAuthGuard, FirmRoleGuard)
@RequireCapability('manageInvoices')
export class FeePackagesController {
  constructor(private fees: FeePackagesService) {}

  @Get('fee-packages')
  list(@CurrentUser() user: AuthUser, @Query() query: FeePackageQueryDto) { return this.fees.list(user, query.caseTypeId); }

  @Post('fee-packages')
  @RequireCapability('manageSubscription')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFeePackageDto) { return this.fees.create(user, dto); }

  @Patch('fee-packages/:id')
  @RequireCapability('manageSubscription')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFeePackageDto) { return this.fees.update(user, id, dto); }

  @Post('fee-packages/:id/archive')
  @RequireCapability('manageSubscription')
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.fees.archive(user, id); }

  @Post('fee-packages/preview')
  preview(@CurrentUser() user: AuthUser, @Body() dto: PreviewFeePackageDto) { return this.fees.preview(user, dto); }

  @Get('cases/:id/fee')
  getCaseFee(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.fees.getCaseFee(user, id); }

  @Put('cases/:id/fee')
  setCaseFee(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetCaseFeeDto) { return this.fees.setCaseFee(user, id, dto); }

  @Post('cases/:id/fee/close-out')
  closeOut(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseOutFeeDto) { return this.fees.closeOut(user, id, dto); }

  @Get('billing/milestones-due')
  milestonesDue(@CurrentUser() user: AuthUser) { return this.fees.milestonesDue(user); }
}
