import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ClientPortalAuthService } from './client-portal-auth.service';
import { ClientPortalAuthController } from './client-portal-auth.controller';
import { ClientPortalService } from './client-portal.service';
import { ClientPortalController } from './client-portal.controller';
import { ClientPortalIntakeController } from './client-portal-intake.controller';
import { ClientPortalIntakeService } from './client-portal-intake.service';
import { ClientPortalJwtStrategy } from './client-portal-jwt.strategy';
import { ClientPortalIntegrationsController } from './client-portal-integrations.controller';
import { ClientPortalMessagesController } from './client-portal-messages.controller';
import { ClientPortalInviteController } from './client-portal-invite.controller';
import { ClientPortalInviteService } from './client-portal-invite.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentsModule } from '../documents/documents.module';
import { CasesModule } from '../cases/cases.module';

@Module({
  imports: [
    PassportModule.register({}),
    JwtModule.register({}),
    NotificationsModule,
    DocumentsModule,
    CasesModule,
  ],
  controllers: [
    ClientPortalAuthController,
    ClientPortalController,
    ClientPortalIntakeController,
    ClientPortalIntegrationsController,
    ClientPortalMessagesController,
    ClientPortalInviteController,
  ],
  providers: [
    ClientPortalAuthService,
    ClientPortalService,
    ClientPortalIntakeService,
    ClientPortalJwtStrategy,
    ClientPortalInviteService,
  ],
})
export class ClientPortalModule {}
