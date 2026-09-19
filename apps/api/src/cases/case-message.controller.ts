import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';
import { CaseMessageService } from './case-message.service';
import { CreateCaseMessageDto } from './dto/case-message.dto';

@Controller('cases/:caseId/messages')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class CaseMessageController {
  constructor(private readonly messages: CaseMessageService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.messages.listForStaff(user, caseId);
  }

  @Post()
  // 20MB เท่ากับที่ portal รับ เพื่อให้ทั้งสองฝั่งแนบไฟล์ขนาดเดียวกันได้
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  create(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateCaseMessageDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.messages.createFromStaff(user, caseId, dto.body ?? '', file);
  }

  @Get(':messageId/attachment')
  async attachment(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('messageId') messageId: string,
    @Res() res: Response,
  ) {
    const file = await this.messages.getAttachment(user, caseId, messageId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.send(file.buffer);
  }
}
