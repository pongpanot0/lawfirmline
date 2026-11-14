import { applyDecorators, CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata, UseInterceptors } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, Observable, switchMap, tap } from 'rxjs';
import { PlanQuotaService } from '../services/plan-quota.service';

const AI_ACTION_KEY = 'aiAction';

/** Refuses the request when the plan's AI actions are used up; counts one use when it succeeds. */
@Injectable()
export class AiQuotaInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector, private quota: PlanQuotaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string>(AI_ACTION_KEY, context.getHandler());
    const user = context.switchToHttp().getRequest().user;
    if (!action || !user?.firmId) return next.handle();
    return from(this.quota.assertAiAvailable(user)).pipe(
      switchMap(() => next.handle()),
      tap({ complete: () => void this.quota.recordAi(user, action).catch(() => undefined) }),
    );
  }
}

/** A user-pressed AI button: counts against PLAN_CONFIG.aiQuota. */
export const AiAction = (action: string) => applyDecorators(SetMetadata(AI_ACTION_KEY, action), UseInterceptors(AiQuotaInterceptor));
