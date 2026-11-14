import { applyDecorators, CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata, UseInterceptors } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, Observable, switchMap, concatMap, map } from 'rxjs';
import { aiCreditContext, requestAiCredits } from '../ai-credit-context';
import { PlanQuotaService } from '../services/plan-quota.service';

const AI_ACTION_KEY = 'aiAction';

/** Refuses the request when the plan's AI actions are used up; records the request's credits when it succeeds. */
@Injectable()
export class AiQuotaInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector, private quota: PlanQuotaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string>(AI_ACTION_KEY, context.getHandler());
    const user = context.switchToHttp().getRequest().user;
    if (!action || !user?.firmId) return next.handle();
    return from(this.quota.assertAiAvailable(user)).pipe(
      switchMap(() => new Observable((subscriber) => aiCreditContext.run(
        { user, quota: this.quota, files: new Map() },
        () => next.handle().pipe(
          concatMap((result) => from(this.quota.recordAi(user, action, requestAiCredits())).pipe(map(() => result))),
        ).subscribe(subscriber),
      ))),
    );
  }
}

/** A user-pressed AI button: counts against PLAN_CONFIG.aiQuota. */
export const AiAction = (action: string) => applyDecorators(SetMetadata(AI_ACTION_KEY, action), UseInterceptors(AiQuotaInterceptor));
