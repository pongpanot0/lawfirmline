import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(private templatesService: TemplatesService) {}

  @Get('document-templates')
  findAll(@Query('caseTypeId') caseTypeId?: string) {
    return this.templatesService.findAll(caseTypeId);
  }

  @Get('cases/:caseId/document-templates/:templateId/render')
  @UseGuards(CaseAccessGuard)
  render(
    @Param('caseId') caseId: string,
    @Param('templateId') templateId: string,
  ) {
    return this.templatesService.render(templateId, caseId);
  }
}
