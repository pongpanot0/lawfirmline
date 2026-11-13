import { Body, Controller, Get, Logger, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AllowExternal } from '../common/decorators/allow-external.decorator';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { FileStorageService } from '../common/services/file-storage.service';
import { safeMimeType } from '../common/utils/safe-mime-type';
import { AppFeedbackService, FEEDBACK_MAX_BYTES } from './app-feedback.service';
import { CreateAppFeedbackDto, FeedbackCommentsQueryDto, FeedbackPagesQueryDto, FeedbackQueryDto, ResolveFeedbackDto } from './dto/app-feedback.dto';

@Controller('app-feedback')
@UseGuards(JwtAuthGuard)
@SkipSubscription()
@AllowExternal()
export class AppFeedbackController {
  constructor(private feedback: AppFeedbackService) {}

  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: {
    // The global guard runs before JWT; keep its IP ceiling, then enforce 10/user after JWT.
    limit: (context) => context.switchToHttp().getRequest().user ? 10 : 600,
    ttl: 60_000,
    getTracker: (request) => request.user?.id ?? request.ip,
  } })
  @UseInterceptors(FileInterceptor('screenshot', { limits: { fileSize: FEEDBACK_MAX_BYTES, files: 1 } }))
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAppFeedbackDto, @UploadedFile() screenshot?: Express.Multer.File) {
    return this.feedback.create(user, dto, screenshot);
  }
}

@Controller('platform/feedback')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@SkipSubscription()
export class PlatformFeedbackController {
  private readonly logger = new Logger(PlatformFeedbackController.name);
  constructor(private feedback: AppFeedbackService, private storage: FileStorageService) {}

  @Get()
  list(@Query() query: FeedbackQueryDto) { return this.feedback.list(query); }

  @Get('summary')
  summary() { return this.feedback.summary(); }

  @Patch('resolve')
  resolve(@CurrentUser() user: AuthUser, @Body() dto: ResolveFeedbackDto) { return this.feedback.setResolved(dto.ids, dto.resolved, user.email); }

  @Get('pages')
  pages(@Query() query: FeedbackPagesQueryDto) { return this.feedback.pages(query); }

  @Get('pages/comments')
  pageComments(@Query() query: FeedbackCommentsQueryDto) { return this.feedback.pageComments(query); }

  @Get('line-rounds')
  lineRounds() { return this.feedback.lineRounds(); }

  @Post('line-rounds')
  sendLineRound(@CurrentUser() user: AuthUser) { return this.feedback.sendLineRound(user.id); }

  @Get(':id/screenshot')
  async screenshot(@Param('id') id: string, @Res() res: Response) {
    const file = await this.feedback.screenshot(id);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', safeMimeType(file.screenshotMime ?? 'application/octet-stream'));
    res.setHeader('Content-Disposition', 'attachment');
    const stream = await this.storage.openDownloadStream(file.screenshotPath!);
    stream.on('error', (error: Error) => {
      this.logger.warn(`Feedback screenshot stream failed: ${error.message}`);
      res.destroy(error);
    });
    stream.pipe(res);
  }
}
