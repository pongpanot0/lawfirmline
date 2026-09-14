import { Body, Controller, Get, Param, Query, ParseUUIDPipe, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsDateString, IsOptional, IsInt, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { Response } from 'express';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientPortalGuard } from './client-portal.guard';
import { CurrentPortalUser } from './current-portal-user.decorator';
import { PortalIdentity } from './client-portal-jwt.strategy';
import { PortalWorkroomService } from './portal-workroom.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { buildContentDispositionHeader } from '../common/utils/sanitize-filename';
import { safeMimeType } from '../common/utils/safe-mime-type';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
class MessageDto { @IsUUID() requestKey!: string; @IsString() @MaxLength(10000) body!: string; }
class AgreementDto { @IsInt() @Min(0) version!: number; }
class ProposalDto extends AgreementDto { @IsString() @MinLength(1) @MaxLength(10000) scopeText!: string; @IsDateString() proposedDate!: string; }
class MessagesQuery { @IsOptional() @IsUUID() before?: string; }
class DeliverDto { @IsUUID() messageId!: string; }
class HandoverDto { @IsUUID() fromContactId!: string; @IsUUID() toContactId!: string; }
const upload = () => FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } });
async function download(res: Response, files: FileStorageService, file: { path: string; filename: string; mimeType: string }) {
  const stream = await files.openDownloadStream(file.path);
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Type', safeMimeType(file.mimeType)); res.setHeader('Content-Disposition', buildContentDispositionHeader(file.filename)); stream.pipe(res);
}
@Controller('portal-workroom')
@UseGuards(JwtAuthGuard)
export class StaffWorkroomController {
  constructor(private service: PortalWorkroomService, private files: FileStorageService) {}
  @Get() list(@CurrentUser() u: AuthUser) { return this.service.list(u); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() query: MessagesQuery) { return this.service.get({ staff: u }, id, query.before); }
  @Post(':id/messages') @UseInterceptors(upload()) message(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MessageDto, @UploadedFile() file?: Express.Multer.File) { return this.service.message({ staff: u }, id, dto, file); }
  @Get(':id/files/:messageId') async file(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('messageId', ParseUUIDPipe) messageId: string, @Res() res: Response) { return download(res, this.files, await this.service.file({ staff: u }, id, messageId)); }
  @Post(':id/proposal') proposal(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProposalDto) { return this.service.proposal(u, id, dto); }
  @Post(':id/deliver') deliver(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeliverDto) { return this.service.deliver(u, id, dto.messageId); }
  @Post(':id/handover') handover(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HandoverDto) { return this.service.handover(u, id, dto); }
}
@Controller('client-portal/workroom')
@UseGuards(ClientPortalGuard)
@SkipSubscription()
export class ClientWorkroomController {
  constructor(private service: PortalWorkroomService, private files: FileStorageService) {}
  @Get(':id') get(@CurrentPortalUser() u: PortalIdentity, @Param('id', ParseUUIDPipe) id: string, @Query() query: MessagesQuery) { return this.service.get({ portal: u }, id, query.before); }
  @Post(':id/messages') @UseInterceptors(upload()) message(@CurrentPortalUser() u: PortalIdentity, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MessageDto, @UploadedFile() file?: Express.Multer.File) { return this.service.message({ portal: u }, id, dto, file); }
  @Get(':id/files/:messageId') async file(@CurrentPortalUser() u: PortalIdentity, @Param('id', ParseUUIDPipe) id: string, @Param('messageId', ParseUUIDPipe) messageId: string, @Res() res: Response) { return download(res, this.files, await this.service.file({ portal: u }, id, messageId)); }
  @Post(':id/accept') accept(@CurrentPortalUser() u: PortalIdentity, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AgreementDto) { return this.service.accept(u, id, dto.version); }
  @Post(':id/acknowledge-delivery') acknowledge(@CurrentPortalUser() u: PortalIdentity, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AgreementDto) { return this.service.accept(u, id, dto.version, true); }
}
