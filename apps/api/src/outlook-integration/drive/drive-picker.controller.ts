import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser, Role } from '@lawfirm/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CaseDriveService } from './case-drive.service';
import { DriveCaseImportService } from './drive-case-import.service';
import { ImportDriveCasesDto } from './drive-case-import.dto';
import { DriveChildrenQueryDto, SiteSearchQueryDto } from './drive.dto';

/** Folder picker — browses the caller's own Microsoft account only. */
@Controller('outlook/drive')
@UseGuards(JwtAuthGuard)
export class DrivePickerController {
  constructor(private caseDrive: CaseDriveService, private caseImport: DriveCaseImportService) {}

  @Get('children')
  children(@CurrentUser() user: AuthUser, @Query() query: DriveChildrenQueryDto) {
    return this.caseDrive.pickerChildren(user, query.driveId ?? 'me', query.itemId ?? 'root');
  }

  /** Child folders with case suggestions; linking still needs a per-row confirm (PUT /cases/:id/drive-link). */
  @Get('folder-suggestions')
  folderSuggestions(@CurrentUser() user: AuthUser, @Query() query: DriveChildrenQueryDto) {
    return this.caseDrive.folderSuggestions(user, query.driveId ?? 'me', query.itemId ?? 'root');
  }

  /** "สร้างคดีจาก folder" — one new case per folder, each linked with the caller's own account. */
  @Post('case-import')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.LAWYER)
  importCases(@CurrentUser() user: AuthUser, @Body() dto: ImportDriveCasesDto) {
    return this.caseImport.importCases(user, dto);
  }

  @Get('shared')
  shared(@CurrentUser() user: AuthUser) {
    return this.caseDrive.pickerShared(user);
  }

  @Get('sites')
  sites(@CurrentUser() user: AuthUser, @Query() query: SiteSearchQueryDto) {
    return this.caseDrive.pickerSites(user, query.q);
  }

  @Get('sites/:siteId/drives')
  siteDrives(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.caseDrive.pickerSiteDrives(user, siteId);
  }
}
