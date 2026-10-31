import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ErrorLogService } from './error-log.service';
import { ErrorCaptureFilter } from './error-capture';
import { ClientErrorController, ErrorLogController } from './error-log.controller';

@Global()
@Module({
  controllers: [ErrorLogController, ClientErrorController],
  providers: [ErrorLogService, { provide: APP_FILTER, useClass: ErrorCaptureFilter }],
  exports: [ErrorLogService],
})
export class ErrorLogModule {}
