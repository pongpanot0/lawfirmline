import { ArgumentsHost, Catch, ConsoleLogger, HttpException, PayloadTooLargeException } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from '@lawfirm/shared';
import { PayloadTooLargeFilter } from '../common/filters/payload-too-large.filter';
import { ErrorLogService } from './error-log.service';

/** BaseExceptionFilter logs unknown errors under this context; the filter already recorded them with the request. */
const SKIP_CONTEXTS = new Set(['ExceptionsHandler']);

/**
 * The one global filter: records every 5xx with its request, then answers as
 * Nest would. It also owns the 413 translation so no second global filter
 * competes for the same exception.
 */
@Catch()
export class ErrorCaptureFilter extends BaseExceptionFilter {
  private readonly payloadTooLarge = new PayloadTooLargeFilter();

  constructor(adapterHost: HttpAdapterHost, private readonly errors: ErrorLogService) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof PayloadTooLargeException) return this.payloadTooLarge.catch(exception, host);
    if (host.getType() === 'http') {
      const status = exception instanceof HttpException ? exception.getStatus() : 500;
      if (status >= 500) {
        const req = host.switchToHttp().getRequest<Request & { user?: AuthUser }>();
        this.errors.record({
          source: 'api',
          message: exception instanceof Error ? exception.message : String(exception),
          stack: exception instanceof Error ? exception.stack : null,
          context: exception instanceof Error ? exception.constructor.name : null,
          method: req.method,
          path: req.originalUrl?.split('?')[0],
          statusCode: status,
          userId: req.user?.id,
          firmId: req.user?.firmId,
          userAgent: req.headers['user-agent'],
        });
      }
    }
    super.catch(exception, host);
  }
}

/** Every `Logger.error` (cron jobs, mail, integrations) also lands in ErrorLog. */
export class ErrorCaptureLogger extends ConsoleLogger {
  constructor(private readonly errors: ErrorLogService) {
    super();
  }

  error(message: unknown, ...rest: unknown[]) {
    super.error(message, ...rest);
    // Nest calls error(message, context) or error(message, stack, context).
    const context = rest.length > 0 && typeof rest[rest.length - 1] === 'string' ? (rest[rest.length - 1] as string) : this.context;
    if (context && SKIP_CONTEXTS.has(context)) return;
    const stack = rest.length > 1 && typeof rest[0] === 'string' ? rest[0] : message instanceof Error ? message.stack : null;
    this.errors.record({
      source: 'server',
      message: message instanceof Error ? message.message : typeof message === 'string' ? message : JSON.stringify(message),
      stack,
      context,
    });
  }
}
