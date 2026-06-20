import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { TravelService } from './travel.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('travel')
@UseGuards(JwtAuthGuard)
export class TravelController {
  constructor(private travelService: TravelService) {}

  @Get('calculate')
  async calculate(
    @Query('origin') origin?: string,
    @Query('destination') destination?: string,
  ) {
    const office = await this.travelService.getOfficeAddress();
    return this.travelService.calculateTravel(
      origin ?? office,
      destination ?? office,
    );
  }
}
