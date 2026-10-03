import { SkipThrottle } from '@nestjs/throttler';
import { Controller, Get } from '@nestjs/common';
import { SkipSubscription } from '../saas/decorators/saas.decorators';

@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get()
  @SkipSubscription()
  check() {
    return { status: 'ok' };
  }
}
