import { Controller, Get } from '@nestjs/common';
import { SkipSubscription } from '../saas/decorators/saas.decorators';

@Controller('health')
export class HealthController {
  @Get()
  @SkipSubscription()
  check() {
    return { status: 'ok' };
  }
}
