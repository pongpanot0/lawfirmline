import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService, RequestMeta } from './auth.service';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';
import { RegisterDto, ForgotPasswordDto, ResetPasswordDto } from './dto/register.dto';
import { VerifyMfaLoginDto, MfaCodeDto, DisableMfaDto } from './dto/mfa.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { TenantRequest } from '../saas/middleware/tenant-resolve.middleware';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @SkipSubscription()
  login(@Body() dto: LoginDto, @Req() req: TenantRequest) {
    return this.authService.login(dto, req.resolvedFirmId ?? undefined, requestMeta(req));
  }

  @Post('register')
  @SkipSubscription()
  register(@Body() dto: RegisterDto, @Req() req: TenantRequest) {
    return this.authService.register(dto, req.resolvedFirmId, requestMeta(req));
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
  verifyMfa(@Body() dto: VerifyMfaLoginDto, @Req() req: TenantRequest) {
    return this.authService.verifyMfaLogin(dto.mfaToken, dto.code, req.resolvedFirmId ?? undefined, requestMeta(req));
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
  logout(@Body() dto: RefreshTokenDto) {
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
