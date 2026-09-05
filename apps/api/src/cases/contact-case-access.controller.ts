import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser, Role } from '@lawfirm/shared';
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
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  grant(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: GrantContactCaseAccessDto,
  ) {
    return this.accessService.grant(user, caseId, dto);
  }

  @Delete(':accessId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('accessId') accessId: string,
  ) {
    return this.accessService.revoke(user, caseId, accessId);
  }
}
