import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DocumentsService } from './documents.service';

/** ค้นเอกสารข้ามคดี (เฉพาะคดีที่ user เห็นได้) — เดิมค้นได้แค่ในคดีทีละคดี */
@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsSearchController {
  constructor(private documentsService: DocumentsService) {}

  @Get('search')
  search(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('category') category?: string,
  ) {
    return this.documentsService.search(user, q?.trim() || undefined, category || undefined);
  }
}
