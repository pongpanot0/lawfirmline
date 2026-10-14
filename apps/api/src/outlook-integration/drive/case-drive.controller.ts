import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AuthUser, Role } from '@lawfirm/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../../common/guards/case-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CaseDriveService } from './case-drive.service';
import { LinkDriveFolderDto } from './drive.dto';

/** OneDrive/SharePoint folder of a case. CaseAccessGuard (params.caseId) decides who may see it. */
@Controller('cases/:caseId')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class CaseDriveController {
  constructor(private caseDrive: CaseDriveService) {}

  @Get('drive')
  list(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.caseDrive.listCaseFolder(user, caseId);
  }

  @Put('drive-link')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.LAWYER)
  link(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: LinkDriveFolderDto) {
    return this.caseDrive.linkFolder(user, caseId, dto);
  }

  @Delete('drive-link')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.LAWYER)
  unlink(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.caseDrive.unlinkFolder(user, caseId);
  }

  @Post('drive/items/:itemId/open')
  open(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Param('itemId') itemId: string) {
    return this.caseDrive.openItem(user, caseId, itemId);
  }

  @Post('drive/items/:itemId/import')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.LAWYER)
  importOne(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Param('itemId') itemId: string) {
    return this.caseDrive.importItem(user, caseId, itemId);
  }

  @Post('drive/import-all')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.LAWYER)
  importAll(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.caseDrive.importAll(user, caseId);
  }
}
