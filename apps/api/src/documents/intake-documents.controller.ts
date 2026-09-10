import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { DocumentsService } from './documents.service';
import { UpdateDocumentVisibilityDto } from './dto/update-visibility.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { buildContentDispositionHeader } from '../common/utils/sanitize-filename';
import { safeMimeType } from '../common/utils/safe-mime-type';
import { AuthUser } from '@lawfirm/shared';
import { FileStorageService } from '../common/services/file-storage.service';

@Controller('intake/:intakeId/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntakeDocumentsController {
  constructor(
    private documentsService: DocumentsService,
    private fileStorage: FileStorageService,
  ) {}

  @Get()
  findByIntake(@CurrentUser() user: AuthUser, @Param('intakeId') intakeId: string) {
    return this.documentsService.findByIntake(user, intakeId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('intakeId') intakeId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentsService.uploadForIntake(user, intakeId, file);
  }

  @Post(':documentId/versions')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadVersion(
    @CurrentUser() user: AuthUser,
    @Param('intakeId') intakeId: string,
    @Param('documentId') documentId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentsService.uploadNewVersionForIntake(user, intakeId, documentId, file);
  }

  @Patch(':documentId/visibility')
  updateVisibility(
    @CurrentUser() user: AuthUser,
    @Param('intakeId') intakeId: string,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateDocumentVisibilityDto,
  ) {
    return this.documentsService.updateVisibilityForIntake(user, intakeId, documentId, dto.visibleToClient);
  }

  @Delete(':documentId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('intakeId') intakeId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.documentsService.removeFromIntake(user, intakeId, documentId);
  }

  @Get(':documentId/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('intakeId') intakeId: string,
    @Param('documentId') documentId: string,
    @Query('version') version: string,
    @Res() res: Response,
  ) {
    const fileInfo = await this.documentsService.getFilePathForIntake(
      user,
      intakeId,
      documentId,
      version ? parseInt(version, 10) : undefined,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', safeMimeType(fileInfo.mimeType));
    res.setHeader('Content-Disposition', buildContentDispositionHeader(fileInfo.filename));
    const stream = await this.fileStorage.openDownloadStream(fileInfo.path);
    stream.pipe(res);
  }
}
