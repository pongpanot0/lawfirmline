import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { TemplatesService } from './templates.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(private templatesService: TemplatesService) {}

  @Get('document-templates')
  findAll(@CurrentUser() user: AuthUser, @Query('caseTypeId') caseTypeId?: string) {
    return this.templatesService.findAll(user.firmId, caseTypeId);
  }

  @Get('cases/:caseId/document-templates/:templateId/render')
  @UseGuards(CaseAccessGuard)
  render(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('templateId') templateId: string,
  ) {
    return this.templatesService.render(user.firmId, templateId, caseId);
  }
}
