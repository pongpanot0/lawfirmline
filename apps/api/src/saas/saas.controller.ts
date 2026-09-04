import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { InvitationService } from './invitation.service';
import { SubscriptionService } from './subscription.service';
import { OmiseService } from './omise.service';
import { TenantService } from './tenant.service';
import { AuthService } from '../auth/auth.service';
import { AcceptInviteDto, CheckoutDto, InviteUserDto, PromptPayCheckoutDto } from './dto/saas.dto';
import { FirmRoleGuard } from './guards/firm-role.guard';
import { OwnerOnly, SkipSubscription } from './decorators/saas.decorators';
import { BillingPeriod, SubscriptionPlan } from '@lawfirm/shared';

@Controller('saas')
export class SaasController {
  constructor(
    private invitations: InvitationService,
    private subscriptions: SubscriptionService,
    private omise: OmiseService,
    private tenant: TenantService,
    private auth: AuthService,
  ) {}

  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  @SkipSubscription()
  getSubscription(@CurrentUser() user: AuthUser) {
    return this.subscriptions.getSummary(user);
  }

  @Get('plans')
  @UseGuards(JwtAuthGuard)
  @SkipSubscription()
  getPlans(@CurrentUser() user: AuthUser) {
    return this.subscriptions.getPlans(user);
  }

  @Get('billing/history')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @OwnerOnly()
  @SkipSubscription()
  getBillingHistory(@CurrentUser() user: AuthUser) {
    return this.subscriptions.getBillingHistory(user);
  }

  @Post('billing/checkout')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @OwnerOnly()
  @SkipSubscription()
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.subscriptions.createCheckout(
      user,
      dto.plan as SubscriptionPlan,
      {
        omiseToken: dto.omiseToken,
        omiseSource: dto.omiseSource,
      },
      (dto.billingPeriod as BillingPeriod | undefined) ?? BillingPeriod.MONTHLY,
    );
  }

  @Post('billing/checkout/promptpay')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @OwnerOnly()
  @SkipSubscription()
  promptPayCheckout(@CurrentUser() user: AuthUser, @Body() dto: PromptPayCheckoutDto) {
    return this.subscriptions.createPromptPayCheckout(
      user,
      dto.plan as SubscriptionPlan,
      (dto.billingPeriod as BillingPeriod | undefined) ?? BillingPeriod.MONTHLY,
    );
  }

  @Get('billing/invoices/:invoiceId/qr')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @OwnerOnly()
  @SkipSubscription()
  async getInvoiceQr(@CurrentUser() user: AuthUser, @Param('invoiceId') invoiceId: string) {
    const { data, contentType } = await this.subscriptions.getInvoiceQrImage(user, invoiceId);
    return new StreamableFile(data, {
      type: contentType,
      disposition: 'inline',
    });
  }

  @Get('billing/invoices/:invoiceId/status')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @OwnerOnly()
  @SkipSubscription()
  invoiceStatus(@CurrentUser() user: AuthUser, @Param('invoiceId') invoiceId: string) {
    return this.subscriptions.getInvoicePaymentStatus(user, invoiceId);
  }

  @Post('billing/cancel')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @OwnerOnly()
  @SkipSubscription()
  cancel(@CurrentUser() user: AuthUser) {
    return this.subscriptions.cancel(user);
  }

  @Get('omise/public-key')
  @SkipSubscription()
  getOmiseKey() {
    return { publicKey: this.omise.getPublicKey(), mockMode: this.omise.isMockMode() };
  }

  @Post('invitations')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @OwnerOnly()
  @SkipSubscription()
  invite(@CurrentUser() user: AuthUser, @Body() dto: InviteUserDto) {
    return this.invitations.invite(user, dto);
  }

  @Get('members')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @OwnerOnly()
  @SkipSubscription()
  listMembers(@CurrentUser() user: AuthUser) {
    return this.tenant.listMembers(user);
  }

  @Get('invitations')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @OwnerOnly()
  @SkipSubscription()
  listInvitations(@CurrentUser() user: AuthUser) {
    return this.invitations.listPending(user);
  }

  @Delete('members/:userId')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @OwnerOnly()
  @SkipSubscription()
  removeMember(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.tenant.removeMember(user, userId);
  }

  @Delete('invitations/:id')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @OwnerOnly()
  @SkipSubscription()
  cancelInvitation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invitations.cancel(user, id);
  }

  @Get('invitations/:token')
  @SkipSubscription()
  getInvitation(@Param('token') token: string) {
    return this.invitations.getByToken(token);
  }

  @Post('invitations/accept')
  @SkipSubscription()
  async acceptInvitation(@Body() dto: AcceptInviteDto) {
    const authUser = await this.invitations.accept(dto);
    return this.auth.loginFromAuthUser(authUser);
  }

  @Post('webhooks/omise')
  @SkipSubscription()
  omiseWebhook(@Body() body: Record<string, unknown>) {
    return this.subscriptions.handleWebhook(body);
  }
}

@Controller('invites')
export class PublicInviteController {
  constructor(private invitations: InvitationService) {}

  @Get(':token')
  @SkipSubscription()
  get(@Param('token') token: string) {
    return this.invitations.getByToken(token);
  }
}
