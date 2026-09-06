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
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { buildContentDispositionHeader } from '../common/utils/sanitize-filename';
import { safeMimeType } from '../common/utils/safe-mime-type';
import { AuthUser } from '@lawfirm/shared';

@Controller('intake/:intakeId/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntakeDocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Get()
  findByIntake(@Param('intakeId') intakeId: string) {
    return this.documentsService.findByIntake(intakeId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('intakeId') intakeId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentsService.uploadForIntake(user, intakeId, file);
  }

  @Post(':documentId/versions')
  @UseInterceptors(FileInterceptor('file'))
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
    @Param('intakeId') intakeId: string,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateDocumentVisibilityDto,
  ) {
    return this.documentsService.updateVisibilityForIntake(intakeId, documentId, dto.visibleToClient);
  }

  @Get(':documentId/download')
  async download(
    @Param('intakeId') intakeId: string,
    @Param('documentId') documentId: string,
    @Query('version') version: string,
    @Res() res: Response,
  ) {
    const fileInfo = await this.documentsService.getFilePathForIntake(
      intakeId,
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
