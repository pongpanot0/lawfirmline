import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AI_CREDIT_COST, AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCredits } from '../common/decorators/require-credits.decorator';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { MatterBriefService } from './matter-brief.service';
import { SecretaryChatService } from './secretary-chat.service';
import { SecretaryChatDto } from './dto/secretary-chat.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class SecretaryController {
  constructor(
    private readonly briefs: MatterBriefService,
    private readonly chat: SecretaryChatService,
  ) {}

  @Get('cases/:caseId/brief')
  @UseGuards(CaseAccessGuard)
  async caseBrief(@CurrentUser() u: AuthUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    const brief = await this.briefs.getCaseBrief(u, caseId);
    if (!brief) throw new NotFoundException('Case not found');
    return brief;
  }

  @Post('ai/secretary')
  @RequireCredits(AI_CREDIT_COST.SECRETARY_CHAT)
  @UseInterceptors(AiCreditsInterceptor)
  secretary(@CurrentUser() u: AuthUser, @Body() dto: SecretaryChatDto) {
    if (dto.messages[dto.messages.length - 1].role !== 'user') throw new BadRequestException('ข้อความสุดท้ายต้องเป็นของผู้ใช้');
    return this.chat.chat(u, dto.messages);
  }

  @Post('ai/secretary/transcribe')
  @RequireCredits(AI_CREDIT_COST.SECRETARY_TRANSCRIBE)
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 10 * 1024 * 1024 } }), AiCreditsInterceptor)
  transcribe(@CurrentUser() u: AuthUser, @UploadedFile() audio: Express.Multer.File) {
    return this.chat.transcribe(u, audio);
  }
}
