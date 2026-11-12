import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { RequireCapability, SkipSubscription } from '../saas/decorators/saas.decorators';
import { McpConsentDto, McpSettingsDto } from './mcp.dto';
import { McpConsentGuard, McpConsentRequest } from './mcp-consent.guard';
import { McpService } from './mcp.service';

@Controller('mcp-oauth')
@UseGuards(JwtAuthGuard)
@SkipSubscription()
export class McpConsentController {
  constructor(private readonly service: McpService) {}

  @Get('consent')
  info(@CurrentUser() user: AuthUser, @Query() dto: McpConsentDto) { return this.service.consentInfo(user, dto); }

  @Post('consent/approve')
  @UseGuards(McpConsentGuard)
  approve(@CurrentUser() user: AuthUser, @Body() dto: McpConsentDto, @Req() req: McpConsentRequest) { return this.service.approve(user, dto, req.mcpSessionJti); }

  @Post('consent/deny')
  deny(@CurrentUser() user: AuthUser, @Body() dto: McpConsentDto) { return this.service.deny(user, dto); }
}

@Controller('mcp')
@UseGuards(JwtAuthGuard, FirmRoleGuard)
@SkipSubscription()
export class McpConnectionsController {
  constructor(private readonly service: McpService) {}

  @Get('connections/mine')
  mine(@CurrentUser() user: AuthUser) { return this.service.mine(user); }

  @Delete('connections/mine/:id') @HttpCode(204)
  disconnectMine(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.disconnect(user, id, true); }

  @Get('settings') @RequireCapability('manageAiConnections')
  settings(@CurrentUser() user: AuthUser) { return this.service.settings(user); }

  @Put('settings') @RequireCapability('manageAiConnections')
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: McpSettingsDto) { return this.service.updateSettings(user, dto.enabled); }

  @Get('connections') @RequireCapability('manageAiConnections')
  connections(@CurrentUser() user: AuthUser) { return this.service.list(user); }

  @Delete('connections/:id') @HttpCode(204) @RequireCapability('manageAiConnections')
  disconnect(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.disconnect(user, id, false); }
}
