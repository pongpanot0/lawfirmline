import {
  Body,
  Controller,
  Get,
  NotFoundException,
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
import { PrismaService } from '../prisma/prisma.service';
import { ClosingEmailDraftStatus } from '../generated/prisma';
import { ClosingEmailService } from './closing-email.service';
import {
  CreateClosingEmailDraftDto,
  UpdateClosingEmailDraftDto,
} from './dto/closing-email.dto';

@Controller('cases/:caseId/closing-email-drafts')
@UseGuards(JwtAuthGuard, RolesGuard, CaseAccessGuard)
@Roles(Role.ADMIN, Role.LAWYER)
export class ClosingEmailController {
  constructor(
    private readonly closingEmailService: ClosingEmailService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateClosingEmailDraftDto,
  ) {
    const data = await this.closingEmailService.gatherCaseData(caseId);
    const rendered = this.closingEmailService.renderDraft(
      data,
      dto.selectedActivityIds,
    );

    return this.prisma.closingEmailDraft.create({
      data: {
        caseId,
        createdById: user.id,
        subject: rendered.subject,
        bodyText: rendered.bodyText,
        selectedActivityIds: dto.selectedActivityIds,
        missingDataNotes: data.missingDataNotes,
      },
    });
  }

  @Get()
  findAll(@Param('caseId') caseId: string) {
    return this.prisma.closingEmailDraft.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Patch(':draftId')
  async update(
    @Param('draftId') draftId: string,
    @Body() dto: UpdateClosingEmailDraftDto,
  ) {
    const draft = await this.prisma.closingEmailDraft.findUnique({
      where: { id: draftId },
    });
    if (!draft) throw new NotFoundException('ไม่พบร่างอีเมลนี้');

    return this.prisma.closingEmailDraft.update({
      where: { id: draftId },
      data: {
        subject: dto.subject ?? draft.subject,
        bodyText: dto.bodyText ?? draft.bodyText,
      },
    });
  }

  @Post(':draftId/approve')
  async approve(
    @CurrentUser() user: AuthUser,
    @Param('draftId') draftId: string,
  ) {
    const draft = await this.prisma.closingEmailDraft.findUnique({
      where: { id: draftId },
    });
    if (!draft) throw new NotFoundException('ไม่พบร่างอีเมลนี้');

    return this.prisma.closingEmailDraft.update({
      where: { id: draftId },
      data: {
        status: ClosingEmailDraftStatus.APPROVED,
        approvedById: user.id,
        approvedAt: new Date(),
      },
    });
  }
}
