import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser, Role } from '@lawfirm/shared';
import { ClosingEmailService } from './closing-email.service';
import {
  CreateClosingEmailDraftDto,
  UpdateClosingEmailDraftDto,
} from './dto/closing-email.dto';

@Controller('cases/:caseId/closing-email-drafts')
@UseGuards(JwtAuthGuard, RolesGuard, CaseAccessGuard)
@Roles(Role.ADMIN, Role.LAWYER)
export class ClosingEmailController {
  constructor(private readonly closingEmailService: ClosingEmailService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateClosingEmailDraftDto,
  ) {
    return this.closingEmailService.createDraft(user, caseId, dto);
  }

  @Get()
  findAll(@Param('caseId') caseId: string) {
    return this.closingEmailService.listDrafts(caseId);
  }

  @Patch(':draftId')
  update(
    @Param('caseId') caseId: string,
    @Param('draftId') draftId: string,
    @Body() dto: UpdateClosingEmailDraftDto,
  ) {
    return this.closingEmailService.updateDraft(caseId, draftId, dto);
  }

  @Post(':draftId/approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('draftId') draftId: string,
  ) {
    return this.closingEmailService.approveDraft(user, caseId, draftId);
  }
}
