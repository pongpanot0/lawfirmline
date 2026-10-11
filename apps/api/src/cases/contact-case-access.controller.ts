import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';
import { RequireCapability } from '../saas/decorators/saas.decorators';
import { ContactCaseAccessService } from './contact-case-access.service';
import { GrantContactCaseAccessDto } from './dto/contact-case-access.dto';

@Controller('cases/:caseId/contact-access')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class ContactCaseAccessController {
  constructor(private readonly accessService: ContactCaseAccessService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.accessService.listForCase(user, caseId);
  }

  @Post()
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageFirmContent')
  grant(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: GrantContactCaseAccessDto,
  ) {
    return this.accessService.grant(user, caseId, dto);
  }

  @Delete(':accessId')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageFirmContent')
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('accessId') accessId: string,
  ) {
    return this.accessService.revoke(user, caseId, accessId);
  }
}
