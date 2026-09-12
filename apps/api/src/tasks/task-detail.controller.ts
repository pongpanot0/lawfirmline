import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FileStorageService } from '../common/services/file-storage.service';
import { buildContentDispositionHeader } from '../common/utils/sanitize-filename';
import { safeMimeType } from '../common/utils/safe-mime-type';
import { TaskDetailService, TASK_ATTACHMENT_MAX_BYTES } from './task-detail.service';
import { CreateSubtaskDto, CreateTaskCommentDto } from './dto/task-detail.dto';

/**
 * One address for a task whichever board it came from. Access is decided per
 * task in TasksService.assertAccess, so no case guard is mounted here.
 */
@Controller('tasks/:taskId')
@UseGuards(JwtAuthGuard)
export class TaskDetailController {
  private readonly logger = new Logger(TaskDetailController.name);

  constructor(
    private detail: TaskDetailService,
    private fileStorage: FileStorageService,
  ) {}

  @Get()
  get(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string) {
    return this.detail.getDetail(taskId, user);
  }

  @Post('subtasks')
  createSubtask(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body() dto: CreateSubtaskDto,
  ) {
    return this.detail.createSubtask(taskId, user, dto);
  }

  @Post('comments')
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body() dto: CreateTaskCommentDto,
  ) {
    return this.detail.addComment(taskId, user, dto);
  }

  @Delete('comments/:commentId')
  deleteComment(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.detail.deleteComment(taskId, commentId, user);
  }

  @Post('attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: TASK_ATTACHMENT_MAX_BYTES } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.detail.uploadAttachment(taskId, user, file);
  }

  @Delete('attachments/:attachmentId')
  deleteAttachment(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.detail.deleteAttachment(taskId, attachmentId, user);
  }

  @Get('attachments/:attachmentId/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const file = await this.detail.getAttachmentForDownload(taskId, attachmentId, user);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', safeMimeType(file.mimeType));
    res.setHeader('Content-Disposition', buildContentDispositionHeader(file.filename));
    const stream = await this.fileStorage.openDownloadStream(file.storagePath);
    // A missing or unreadable object mid-stream would otherwise surface as an
    // unhandled 'error' and take the process down instead of the response.
    stream.on('error', (err: Error) => {
      this.logger.warn(`Download stream failed for ${file.storagePath}: ${err.message}`);
      res.destroy(err);
    });
    stream.pipe(res);
  }
}
