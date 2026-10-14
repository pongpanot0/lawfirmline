import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CaseFolderLinksService } from './case-folder-links.service';
import { CaseFolderSyncService } from './case-folder-sync.service';
import { LinkFoldersDto } from './dto/case-folder-links.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class CaseFolderLinksController {
  constructor(
    private links: CaseFolderLinksService,
    private sync: CaseFolderSyncService,
  ) {}

  @Get('outlook/folders')
  listFolders(@CurrentUser() user: AuthUser) {
    return this.links.listFolders(user);
  }

  @Post('outlook/folder-links')
  link(@CurrentUser() user: AuthUser, @Body() dto: LinkFoldersDto) {
    return this.links.linkFolders(user, dto.links);
  }

  @Delete('outlook/folder-links/:linkId')
  unlink(@CurrentUser() user: AuthUser, @Param('linkId') linkId: string) {
    return this.links.unlink(user, linkId);
  }

  @Get('cases/:caseId/email/folder-links')
  @UseGuards(CaseAccessGuard)
  listForCase(@Param('caseId') caseId: string) {
    return this.links.listForCase(caseId);
  }

  /** "ซิงก์ตอนนี้" in the case email tab — per-folder errors come back in `errors`, not as a 500. */
  @Post('cases/:caseId/email/sync')
  @UseGuards(CaseAccessGuard)
  syncCase(@Param('caseId') caseId: string) {
    return this.sync.syncCase(caseId);
  }
}
