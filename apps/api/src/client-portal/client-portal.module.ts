import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ClientPortalAuthService } from './client-portal-auth.service';
import { ClientPortalAuthController } from './client-portal-auth.controller';
import { ClientPortalService } from './client-portal.service';
import { ClientPortalController } from './client-portal.controller';
import { ClientPortalJwtStrategy } from './client-portal-jwt.strategy';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [PassportModule.register({}), JwtModule.register({}), NotificationsModule, DocumentsModule],
  controllers: [ClientPortalAuthController, ClientPortalController],
  providers: [ClientPortalAuthService, ClientPortalService, ClientPortalJwtStrategy],
})
export class ClientPortalModule {}
