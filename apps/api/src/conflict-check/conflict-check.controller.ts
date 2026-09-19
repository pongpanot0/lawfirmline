import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser, Role } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ConflictCheckService } from './conflict-check.service';
import { ConflictSearchDto, RecordConflictCheckDto } from './dto/conflict-check.dto';

@Controller('conflict-check')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConflictCheckController {
  constructor(private conflictCheck: ConflictCheckService) {}

  /** ค้นก่อน ยังไม่บันทึก — ใช้ทั้ง conflict check และตอบ "คนนี้อยู่คดีไหนบ้าง" */
  @Get('search')
  search(@CurrentUser() user: AuthUser, @Query() dto: ConflictSearchDto) {
    return this.conflictCheck.searchFromDto(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('intakeId') intakeId?: string) {
    return this.conflictCheck.list(user, intakeId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.LAWYER)
  record(@CurrentUser() user: AuthUser, @Body() dto: RecordConflictCheckDto) {
    return this.conflictCheck.record(user, dto);
  }
}
