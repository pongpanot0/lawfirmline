import {
  Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min,
} from 'class-validator';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { OwnerOnly, SkipSubscription } from '../saas/decorators/saas.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientPortalGuard } from './client-portal.guard';
import { CurrentPortalUser } from './current-portal-user.decorator';
import { PortalIdentity } from './client-portal-jwt.strategy';
import { ClientAnnualReportsService, ReportAudience } from './client-annual-reports.service';

class ReportSelectionDto {
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  year!: number;

  @IsIn(['REPRESENTED', 'PAYER'])
  audience!: ReportAudience;

}

class PreviewAnnualReportDto extends ReportSelectionDto {
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @IsUUID('all', { each: true })
  caseIds?: string[];
}

class PublishAnnualReportDto extends ReportSelectionDto {
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(1000) @IsUUID('all', { each: true })
  caseIds!: string[];

  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(100) @IsUUID('all', { each: true })
  contactIds!: string[];

  @IsString() @Matches(/^[a-f0-9]{64}$/)
  fingerprint!: string;
}

@Controller('clients/:clientId/annual-reports')
@UseGuards(JwtAuthGuard, FirmRoleGuard)
@OwnerOnly()
export class StaffAnnualReportsController {
  constructor(private reports: ClientAnnualReportsService) {}

  @Post('preview')
  preview(
    @CurrentUser() user: AuthUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: PreviewAnnualReportDto,
  ) {
    return this.reports.preview(user, clientId, dto.year, dto.audience, dto.caseIds);
  }

  @Post()
  publish(
    @CurrentUser() user: AuthUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: PublishAnnualReportDto,
  ) {
    return this.reports.publish(
      user, clientId, dto.year, dto.audience, dto.caseIds, dto.contactIds, dto.fingerprint,
    );
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.reports.listStaff(user, clientId);
  }

  @Post(':reportId/revoke')
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return this.reports.revoke(user, clientId, reportId);
  }
}

@Controller('client-portal/annual-reports')
@UseGuards(ClientPortalGuard)
@SkipSubscription()
export class PortalAnnualReportsController {
  constructor(private reports: ClientAnnualReportsService) {}

  @Get()
  list(@CurrentPortalUser() user: PortalIdentity) {
    return this.reports.listPortal(user);
  }

  @Get(':reportId')
  get(
    @CurrentPortalUser() user: PortalIdentity,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return this.reports.getPortal(user, reportId);
  }
}
