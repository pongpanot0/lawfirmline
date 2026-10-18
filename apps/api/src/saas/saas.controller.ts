import { SkipThrottle } from '@nestjs/throttler';
import { AuthThrottle } from '../common/throttle';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser, hasFirmCapability } from '@lawfirm/shared';
import { InvitationService } from './invitation.service';
import { SubscriptionService } from './subscription.service';
import { TenantService } from './tenant.service';
import { AuthService } from '../auth/auth.service';
import { AcceptInviteDto, CheckoutDto, InviteUserDto, OpenJoinDto, UpdateMemberRoleDto, UpdateFirmSettingsDto } from './dto/saas.dto';
import { FirmRoleGuard } from './guards/firm-role.guard';
import { RequireCapability, SkipSubscription } from './decorators/saas.decorators';
import { BillingPeriod, SubscriptionPlan } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';

@Controller('saas')
export class SaasController {
  constructor(
    private invitations: InvitationService,
    private subscriptions: SubscriptionService,
    private tenant: TenantService,
    private auth: AuthService,
    private prisma: PrismaService,
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
  @RequireCapability('manageSubscription')
  @SkipSubscription()
  getBillingHistory(@CurrentUser() user: AuthUser) {
    return this.subscriptions.getBillingHistory(user);
  }

  @Post('billing/checkout')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @RequireCapability('manageSubscription')
  @SkipSubscription()
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.subscriptions.createCheckout(
      user,
      dto.plan as SubscriptionPlan,
      (dto.billingPeriod as BillingPeriod | undefined) ?? BillingPeriod.MONTHLY,
    );
  }

  @Post('billing/portal')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @RequireCapability('manageSubscription')
  @SkipSubscription()
  portal(@CurrentUser() user: AuthUser) {
    return this.subscriptions.createPortalSession(user);
  }

  @Post('billing/cancel')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @RequireCapability('manageSubscription')
  @SkipSubscription()
  cancel(@CurrentUser() user: AuthUser) {
    return this.subscriptions.cancel(user);
  }

  @Post('invitations')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @RequireCapability('inviteMembers')
  @SkipSubscription()
  invite(@CurrentUser() user: AuthUser, @Body() dto: InviteUserDto) {
    return this.invitations.invite(user, dto);
  }

  @Get('members')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @RequireCapability('inviteMembers')
  @SkipSubscription()
  listMembers(@CurrentUser() user: AuthUser) {
    return this.tenant.listMembers(user);
  }

  @Get('invitations')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @RequireCapability('inviteMembers')
  @SkipSubscription()
  listInvitations(@CurrentUser() user: AuthUser) {
    return this.invitations.listPending(user);
  }

  @Delete('members/:userId')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @RequireCapability('manageMembers')
  @SkipSubscription()
  removeMember(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.tenant.removeMember(user, userId);
  }

  @Patch('members/:userId/role')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @RequireCapability('manageMembers')
  @SkipSubscription()
  updateMemberRole(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.tenant.updateMemberRole(user, userId, dto.role);
  }

  @Delete('invitations/:id')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @RequireCapability('inviteMembers')
  @SkipSubscription()
  cancelInvitation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invitations.cancel(user, id);
  }

  @Get('firm/settings')
  @UseGuards(JwtAuthGuard)
  @SkipSubscription()
  async getFirmSettings(@CurrentUser() user: AuthUser) {
    const firm = await this.prisma.firm.findUnique({
      where: { id: user.firmId },
      select: { ownRefPrefix: true },
    });
    return { ownRefPrefix: firm?.ownRefPrefix || 'TSBREF' };
  }

  @Patch('firm/settings')
  @UseGuards(JwtAuthGuard)
  @SkipSubscription()
  async updateFirmSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdateFirmSettingsDto) {
    if (!hasFirmCapability(user.firmRole, 'manageSubscription')) {
      throw new ForbiddenException('Only firm owners can update settings');
    }

    const current = await this.prisma.firm.findUnique({
      where: { id: user.firmId },
      select: { ownRefPrefix: true },
    });

    if (dto.ownRefPrefix !== undefined) {
      const oldPrefix = current?.ownRefPrefix || 'TSBREF';
      const newPrefix = dto.ownRefPrefix;

      const updated = await this.prisma.firm.update({
        where: { id: user.firmId },
        data: { ownRefPrefix: newPrefix },
        select: { ownRefPrefix: true },
      });

      await this.prisma.auditLog.create({
        data: {
          firmId: user.firmId,
          userId: user.id,
          action: 'FIRM_REF_PREFIX_UPDATED',
          metadata: { oldPrefix, newPrefix },
        },
      });

      return updated;
    }

    return { ownRefPrefix: current?.ownRefPrefix || 'TSBREF' };
  }

  @Get('invitations/:token')
  @SkipSubscription()
  getInvitation(@Param('token') token: string) {
    return this.invitations.getByToken(token);
  }

  @Post('invitations/accept')
  @AuthThrottle()
  @SkipSubscription()
  async acceptInvitation(@Body() dto: AcceptInviteDto) {
    const joined = await this.invitations.accept(dto);
    if (joined.existingAccount) {
      return this.auth.login({ email: joined.existingAccount.email, password: dto.password }, joined.existingAccount.firmId);
    }
    return this.auth.loginFromAuthUser(joined.authUser!);
  }

  @Post('webhooks/stripe')
  @SkipThrottle()
  @SkipSubscription()
  stripeWebhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    return this.subscriptions.handleWebhook(req.rawBody, signature);
  }

  /**
   * Caddy On-Demand TLS ask endpoint.
   * Returns 200 for platform hosts (apex / www / api) and known firm subdomains.
   */
  @Get('caddy-ask')
  @SkipSubscription()
  async caddyAsk(@Query('domain') domain?: string) {
    const allowed = await this.tenant.allowOnDemandTls(domain);
    if (!allowed) {
      throw new NotFoundException('Unknown firm host');
    }
    return { ok: true };
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

/** หน้า join แบรนด์ของ firm ต้องรู้แค่ชื่อ — เปิด public เฉพาะชื่อ ไม่หลุดข้อมูลอื่น */
@Controller('firms')
export class PublicFirmController {
  constructor(
    private tenant: TenantService,
    private invitations: InvitationService,
    private auth: AuthService,
  ) {}

  @Get(':slug/public')
  @SkipSubscription()
  async get(@Param('slug') slug: string) {
    const firm = await this.tenant.findBySlug(slug);
    if (!firm) throw new NotFoundException('Unknown firm');
    return { name: firm.name, slug };
  }

  @Post(':slug/join')
  @SkipSubscription()
  async join(@Param('slug') slug: string, @Body() dto: OpenJoinDto) {
    const authUser = await this.invitations.openJoin(slug, dto);
    return this.auth.loginFromAuthUser(authUser);
  }
}
