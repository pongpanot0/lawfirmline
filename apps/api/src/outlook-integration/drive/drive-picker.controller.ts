import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CaseDriveService } from './case-drive.service';
import { DriveChildrenQueryDto, SiteSearchQueryDto } from './drive.dto';

/** Folder picker — browses the caller's own Microsoft account only. */
@Controller('outlook/drive')
@UseGuards(JwtAuthGuard)
export class DrivePickerController {
  constructor(private caseDrive: CaseDriveService) {}

  @Get('children')
  children(@CurrentUser() user: AuthUser, @Query() query: DriveChildrenQueryDto) {
    return this.caseDrive.pickerChildren(user, query.driveId ?? 'me', query.itemId ?? 'root');
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
