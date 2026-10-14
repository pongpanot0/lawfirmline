import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AvailabilityDto } from './availability.dto';
import { AvailabilityService } from './availability.service';

@Controller('calendar/availability')
@UseGuards(JwtAuthGuard)
export class AvailabilityController {
  constructor(private availability: AvailabilityService) {}

  @Post()
  get(@CurrentUser() user: AuthUser, @Body() dto: AvailabilityDto) {
    return this.availability.get(user, dto);
  }
}
