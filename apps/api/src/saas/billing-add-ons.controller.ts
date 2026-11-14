import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { AllowExternal } from '../common/decorators/allow-external.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireCapability, SkipSubscription } from './decorators/saas.decorators';
import { AddOnCheckoutDto } from './dto/saas.dto';
import { FirmRoleGuard } from './guards/firm-role.guard';
import { SubscriptionService } from './subscription.service';

@Controller('billing')
@UseGuards(JwtAuthGuard)
@SkipSubscription()
export class BillingAddOnsController {
  constructor(private subscriptions: SubscriptionService) {}

  @Get('usage')
  @AllowExternal()
  usage(@CurrentUser() user: AuthUser) {
    return this.subscriptions.getUsage(user);
  }

  @Post('add-ons/checkout')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageSubscription')
  checkout(@CurrentUser() user: AuthUser, @Body() dto: AddOnCheckoutDto) {
    return this.subscriptions.createAddOnCheckout(user, dto.addOn, dto.paymentMethod ?? 'card');
  }
}
