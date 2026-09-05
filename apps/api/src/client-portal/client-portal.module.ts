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
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [PassportModule.register({}), JwtModule.register({}), NotificationsModule, DocumentsModule],
  controllers: [ClientPortalAuthController, ClientPortalController, ClientPortalIntakeController],
  providers: [
    ClientPortalAuthService,
    ClientPortalService,
    ClientPortalIntakeService,
    ClientPortalJwtStrategy,
  ],
})
export class ClientPortalModule {}
