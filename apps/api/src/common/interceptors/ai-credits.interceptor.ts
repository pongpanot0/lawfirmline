import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, switchMap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.module';
import { REQUIRE_CREDITS_KEY } from '../decorators/require-credits.decorator';

@Injectable()
export class AiCreditsInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const cost = this.reflector.get<number>(
      REQUIRE_CREDITS_KEY,
      context.getHandler(),
    );
    if (!cost) return next.handle();

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    if (!userId) return next.handle();

    return from(
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { aiCredits: true },
      }),
    ).pipe(
      switchMap((user) => {
        if (!user || user.aiCredits < cost) {
          throw new HttpException(
            'Insufficient AI credits',
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
        return next.handle().pipe(
          switchMap((result) =>
            from(
              this.prisma.user.update({
                where: { id: userId },
                data: { aiCredits: { decrement: cost } },
              }),
            ).pipe(switchMap(() => from([result]))),
          ),
        );
      }),
    );
  }
}
