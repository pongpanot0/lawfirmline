import { Controller, Get, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '@lawfirm/shared';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DataImportMemberGuard } from './data-import-member.guard';
import { DATA_IMPORT_MAX_BYTES, DataImportService } from './data-import.service';

@Controller('data-import')
@UseGuards(JwtAuthGuard, DataImportMemberGuard)
export class DataImportController {
  constructor(private readonly imports: DataImportService) {}

  @Get('kinds')
  kinds(@CurrentUser() user: AuthUser) { return this.imports.kinds(user); }

  @Get('batches')
  history(@CurrentUser() user: AuthUser) { return this.imports.history(user); }

  @Get(':kind/template')
  async template(@CurrentUser() user: AuthUser, @Param('kind') kind: string, @Res() response: Response) {
    const buffer = await this.imports.template(user, kind);
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="samnuan-import-${kind}.xlsx"`);
    response.send(buffer);
  }

  @Post(':kind/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: DATA_IMPORT_MAX_BYTES } }))
  preview(@CurrentUser() user: AuthUser, @Param('kind') kind: string, @UploadedFile() file?: Express.Multer.File) {
    return this.imports.preview(user, kind, file);
  }

  @Post('batches/:id/commit')
  commit(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.imports.commit(user, id); }
}
