import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientPortalGuard } from './client-portal.guard';
import { CurrentPortalUser } from './current-portal-user.decorator';
import { PortalIdentity } from './client-portal-jwt.strategy';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { CaseMessageService } from '../cases/case-message.service';
import { CreateCaseMessageDto } from '../cases/dto/case-message.dto';

@Controller('client-portal/cases/:caseId/messages')
@UseGuards(ClientPortalGuard)
@SkipSubscription()
export class ClientPortalMessagesController {
  constructor(private readonly messages: CaseMessageService) {}

  @Get()
  list(@CurrentPortalUser() portalUser: PortalIdentity, @Param('caseId') caseId: string) {
    return this.messages.listForPortal(portalUser, caseId);
  }

  @Post()
  // ลูกความส่งเอกสารเพิ่มเข้ามาในสายข้อความเดียวกันได้
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  create(
    @CurrentPortalUser() portalUser: PortalIdentity,
    @Param('caseId') caseId: string,
    @Body() dto: CreateCaseMessageDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.messages.createFromPortal(portalUser, caseId, dto.body ?? '', file);
  }
}
