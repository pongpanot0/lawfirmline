import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { AllowExternal } from '../common/decorators/allow-external.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthThrottle } from '../common/throttle';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { AccountService } from './account.service';
import { ChangeAccountPasswordDto, ConfirmAccountPasswordDto, UpdateAccountProfileDto } from './dto/account.dto';

@Controller('auth/account')
@AllowExternal()
@SkipSubscription()
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(private account: AccountService) {}

  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateAccountProfileDto) {
    return this.account.updateProfile(user.id, user.firmId, dto);
  }

  @Post('password')
  @AuthThrottle()
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangeAccountPasswordDto) {
    return this.account.changePassword(user.id, dto.currentPassword, dto.password);
  }

  @Get('deletion-request')
  getDeletionRequest(@CurrentUser() user: AuthUser) {
    return this.account.getDeletionRequest(user.id);
  }

  @Post('deletion-request')
  @AuthThrottle()
  requestDeletion(@CurrentUser() user: AuthUser, @Body() dto: ConfirmAccountPasswordDto) {
    return this.account.requestDeletion(user.id, user.firmId, dto.currentPassword);
  }
}
