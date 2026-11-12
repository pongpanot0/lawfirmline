import { JwtModule } from '@nestjs/jwt';
import { McpConsentGuard } from './mcp-consent.guard';
import { Module } from '@nestjs/common';
import { SaasModule } from '../saas/saas.module';
import { SecretaryModule } from '../secretary/secretary.module';
import { TasksModule } from '../tasks/tasks.module';
import { CasesModule } from '../cases/cases.module';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { McpOAuthProvider } from './mcp-oauth.provider';
import { McpService } from './mcp.service';
import { McpConsentController, McpConnectionsController } from './mcp.controller';
import { McpToolsService } from './mcp-tools.service';

@Module({
  imports: [JwtModule.register({}), SaasModule, SecretaryModule, TasksModule, CasesModule, BillingModule, NotificationsModule],
  controllers: [McpConsentController, McpConnectionsController],
  providers: [McpConsentGuard, McpOAuthProvider, McpService, McpToolsService],
  exports: [McpOAuthProvider, McpToolsService],
})
export class McpModule {}
