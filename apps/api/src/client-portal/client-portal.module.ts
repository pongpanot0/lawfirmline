import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ClientPortalAuthService } from './client-portal-auth.service';
import { ClientPortalAuthController } from './client-portal-auth.controller';
import { ClientPortalJwtStrategy } from './client-portal-jwt.strategy';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PassportModule.register({}), JwtModule.register({}), NotificationsModule],
  controllers: [ClientPortalAuthController],
  providers: [ClientPortalAuthService, ClientPortalJwtStrategy],
})
export class ClientPortalModule {}
