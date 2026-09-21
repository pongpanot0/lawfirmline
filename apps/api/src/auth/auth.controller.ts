import { Body, Controller, Delete, Get, Param, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, RequestMeta } from './auth.service';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';
import { RegisterDto, ForgotPasswordDto, ResetPasswordDto } from './dto/register.dto';
import { VerifyMfaLoginDto, MfaCodeDto, DisableMfaDto } from './dto/mfa.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser, LoginResult } from '@lawfirm/shared';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { TenantRequest } from '../saas/middleware/tenant-resolve.middleware';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @SkipSubscription()
  async login(@Body() dto: LoginDto, @Req() req: TenantRequest, @Res({ passthrough: true }) res: Response) {
    const result: LoginResult = await this.authService.login(dto, req.resolvedFirmId ?? undefined, requestMeta(req));
    if ('refreshToken' in result) this.authService.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Post('register')
  @SkipSubscription()
  async register(@Body() dto: RegisterDto, @Req() req: TenantRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(dto, req.resolvedFirmId, requestMeta(req));
    this.authService.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  /** Apex has no localStorage session of its own — mint one from the cross-subdomain cookie instead of asking to log in again. */
  @Post('session')
  @SkipSubscription()
  session(@Req() req: Request) {
    const refreshToken = this.authService.readRefreshCookie(req);
    if (!refreshToken) throw new UnauthorizedException();
    return this.authService.sessionFromCookie(refreshToken);
  }

  @Post('forgot-password')
  @SkipSubscription()
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @SkipSubscription()
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Post('refresh')
  @SkipSubscription()
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('mfa/verify')
  @SkipSubscription()
  async verifyMfa(@Body() dto: VerifyMfaLoginDto, @Req() req: TenantRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyMfaLogin(dto.mfaToken, dto.code, req.resolvedFirmId ?? undefined, requestMeta(req));
    this.authService.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Post('mfa/enable/request')
  @UseGuards(JwtAuthGuard)
  @SkipSubscription()
  requestEnableMfa(@CurrentUser() user: AuthUser) {
    return this.authService.requestEnableMfa(user.id, user.email);
  }

  @Post('mfa/enable/confirm')
  @UseGuards(JwtAuthGuard)
  @SkipSubscription()
  confirmEnableMfa(@CurrentUser() user: AuthUser, @Body() dto: MfaCodeDto) {
    return this.authService.confirmEnableMfa(user.id, dto.code);
  }

  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  @SkipSubscription()
  disableMfa(@CurrentUser() user: AuthUser, @Body() dto: DisableMfaDto) {
    return this.authService.disableMfa(user.id, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @SkipSubscription()
  getMe(@CurrentUser() user: AuthUser) {
    return this.authService.getMe(user.id, user.firmId);
  }

  @Post('logout')
  @SkipSubscription()
  logout(@Body() dto: RefreshTokenDto, @Res({ passthrough: true }) res: Response) {
    this.authService.clearRefreshCookie(res);
    return this.authService.logout(dto.refreshToken);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @SkipSubscription()
  listSessions(@CurrentUser() user: AuthUser) {
    return this.authService.listSessions(user.id);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @SkipSubscription()
  revokeSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.authService.revokeSession(user.id, id);
  }

  @Post('sessions/revoke-others')
  @UseGuards(JwtAuthGuard)
  @SkipSubscription()
  revokeOtherSessions(@CurrentUser() user: AuthUser, @Body() dto: RefreshTokenDto) {
    return this.authService.revokeOtherSessions(user.id, dto.refreshToken);
  }
}

function requestMeta(req: TenantRequest): RequestMeta {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}
