import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { RequireCapability } from '../saas/decorators/saas.decorators';
import { DailyBriefService } from './daily-brief.service';
import { MatterBriefService } from './matter-brief.service';
import { SecretaryChatService } from './secretary-chat.service';
import { SecretaryChatDto, SecretaryConfirmDto } from './dto/secretary-chat.dto';
import { AiAction } from '../common/decorators/ai-action.decorator';

@UseGuards(JwtAuthGuard)
@Controller()
export class SecretaryController {
  constructor(
    private readonly briefs: MatterBriefService,
    private readonly chat: SecretaryChatService,
    private readonly daily: DailyBriefService,
  ) {}

  @Get('cases/:caseId/brief')
  @UseGuards(CaseAccessGuard)
  async caseBrief(@CurrentUser() u: AuthUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    const brief = await this.briefs.getCaseBrief(u, caseId);
    if (!brief) throw new NotFoundException('Case not found');
    return brief;
  }

  @Post('ai/secretary')
  @AiAction('secretary-ai-secretary')
  secretary(@CurrentUser() u: AuthUser, @Body() dto: SecretaryChatDto) {
    if (dto.messages[dto.messages.length - 1].role !== 'user') throw new BadRequestException('ข้อความสุดท้ายต้องเป็นของผู้ใช้');
    return this.chat.propose(u, dto.messages);
  }

  @Post('ai/secretary/confirm')
  confirmSecretary(@CurrentUser() u: AuthUser, @Body() dto: SecretaryConfirmDto) {
    return this.chat.confirm(u, dto.proposalId);
  }

  @Post('ai/secretary/transcribe')
  @AiAction('secretary-ai-secretary-transcribe')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 10 * 1024 * 1024 } }))
  transcribe(@CurrentUser() u: AuthUser, @UploadedFile() audio: Express.Multer.File) {
    return this.chat.transcribe(u, audio);
  }

  @Get('ai/secretary/history')
  secretaryHistory(@CurrentUser() u: AuthUser) {
    return this.chat.history(u);
  }

  /** "แชทใหม่": the caller wipes only their own saved chat. */
  @Delete('ai/secretary/history')
  clearSecretaryHistory(@CurrentUser() u: AuthUser) {
    return this.chat.clearHistory(u);
  }

  @Get('ai/daily-brief')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('viewAllCases')
  dailyBrief(@CurrentUser() u: AuthUser, @Query('date') date?: string) {
    return this.daily.get(u, date);
  }

  @Get('ai/daily-brief/dates')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('viewAllCases')
  dailyBriefDates(@CurrentUser() u: AuthUser) {
    return this.daily.listDates(u);
  }
}
