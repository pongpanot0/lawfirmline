import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@lawfirm/shared';
import { PublicHolidaysService } from './public-holidays.service';
import { HolidayItemDto, ReplaceYearDto } from './dto/public-holiday.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('public-holidays')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PublicHolidaysController {
  constructor(private holidays: PublicHolidaysService) {}

  /** Readable by any signed-in user — deadline previews need it. */
  @Get()
  list(@Query('year') year?: string) {
    return this.holidays.list(year ? Number(year) : undefined);
  }

  @Post()
  @Roles(Role.ADMIN)
  add(@Body() dto: HolidayItemDto) {
    return this.holidays.importMany([dto]);
  }

  @Put()
  @Roles(Role.ADMIN)
  replaceYear(@Body() dto: ReplaceYearDto) {
    return this.holidays.replaceYear(dto.year, dto.holidays);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.holidays.remove(id);
  }
}
