import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  // Single-firm deployment: subscription/trial gating is disabled so the app
  // never locks itself out once a trial period elapses.
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}
