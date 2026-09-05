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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';

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
  upload(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentsService.upload(user, caseId, file);
  }

  @Post(':documentId/versions')
  @UseInterceptors(FileInterceptor('file'))
  uploadVersion(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentsService.uploadNewVersion(user, caseId, documentId, file);
  }

  @Patch(':documentId/visibility')
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
    res.setHeader('Content-Type', fileInfo.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileInfo.filename}"`,
    );
    const stream = fs.createReadStream(fileInfo.path);
    stream.pipe(res);
  }
}
