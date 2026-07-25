import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class ClientPortalGuard extends AuthGuard('client-portal-jwt') {}
