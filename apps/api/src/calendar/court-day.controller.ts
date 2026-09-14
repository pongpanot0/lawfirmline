import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CourtDayService } from './court-day.service';
import { CompleteCourtDayDto, SaveCourtDayDto } from './dto/court-day.dto';
@Controller('calendar/events/:id/court-day')
@UseGuards(JwtAuthGuard)
export class CourtDayController {
  constructor(private service: CourtDayService) {}
  @Get() get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.get(user, id);
  }
  @Patch() save(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveCourtDayDto,
  ) {
    return this.service.save(user, id, dto);
  }
  @Post('complete') complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteCourtDayDto,
  ) {
    return this.service.complete(user, id, dto);
  }
}
