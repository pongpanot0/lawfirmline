import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs';
import { DocumentsService } from './documents.service';
import { UpdateDocumentVisibilityDto } from './dto/update-visibility.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { buildContentDispositionHeader } from '../common/utils/sanitize-filename';
import { safeMimeType } from '../common/utils/safe-mime-type';
import { AuthUser, Role } from '@lawfirm/shared';

@Controller('cases/:caseId/documents')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Get()
  findByCase(@Param('caseId') caseId: string) {
    return this.documentsService.findByCase(caseId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  upload(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentsService.upload(user, caseId, file);
  }

  @Post(':documentId/versions')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  uploadVersion(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('notes') notes?: string,
  ) {
    return this.documentsService.uploadNewVersion(user, caseId, documentId, file, notes);
  }

  @Patch(':documentId/visibility')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  updateVisibility(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateDocumentVisibilityDto,
  ) {
    return this.documentsService.updateVisibility(caseId, documentId, dto.visibleToClient);
  }

  @Get(':documentId/download')
  async download(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
    @Query('version') version: string,
    @Res() res: Response,
  ) {
    const fileInfo = await this.documentsService.getFilePath(
      caseId,
      documentId,
      version ? parseInt(version, 10) : undefined,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', safeMimeType(fileInfo.mimeType));
    res.setHeader('Content-Disposition', buildContentDispositionHeader(fileInfo.filename));
    const stream = fs.createReadStream(fileInfo.path);
    stream.pipe(res);
  }
}
