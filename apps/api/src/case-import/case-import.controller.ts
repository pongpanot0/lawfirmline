import { BadRequestException, Controller, Get, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthUser, Role } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CASE_IMPORT_MAX_BYTES, CaseImportService } from './case-import.service';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** "นำเข้าคดีจาก Excel" — own prefix so it never collides with /cases/:id routes. */
@Controller('case-import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.LAWYER)
export class CaseImportController {
  constructor(private caseImport: CaseImportService) {}

  @Get('template')
  async template(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const buffer = await this.caseImport.template(user);
    res.setHeader('Content-Type', XLSX_TYPE);
    res.setHeader('Content-Disposition', 'attachment; filename="case-import-template.xlsx"');
    res.send(buffer);
  }

  /** Reads and checks the filled template; creates nothing. */
  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CASE_IMPORT_MAX_BYTES } }))
  preview(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('ยังไม่ได้เลือกไฟล์');
    return this.caseImport.preview(user, file);
  }
}
