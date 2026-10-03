import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as path from 'path';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowExternal } from '../common/decorators/allow-external.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.module';
import { FileStorageService } from '../common/services/file-storage.service';
import { decodeUploadFilename } from '../common/utils/decode-upload-filename';
import { buildContentDispositionHeader } from '../common/utils/sanitize-filename';
import { safeMimeType } from '../common/utils/safe-mime-type';
import { TasksService } from '../tasks/tasks.service';
import { TASK_ATTACHMENT_MAX_BYTES, TASK_ATTACHMENT_MIME_TYPES } from '../tasks/task-detail.service';
import { TaskStatus } from '../generated/prisma';
import { ExternalStepDto } from './dto/workflow.dto';

type StepRow = { id: string; status: TaskStatus; blockedById: string | null; workflowRunId: string | null; workflowStep: number | null };

/**
 * The only surface a freelancer (FirmRole.EXTERNAL) can reach. Everything is
 * scoped to workflow steps assigned to the caller in their firm; inputs are the
 * files of EARLIER steps of the same run, and only once the caller's step is
 * unblocked. No client names, case titles or other people's details leave here
 * — the case is shown by its Own Ref only.
 */
@Controller('external')
@UseGuards(JwtAuthGuard)
@AllowExternal()
export class ExternalController {
  private readonly logger = new Logger(ExternalController.name);

  constructor(
    private prisma: PrismaService,
    private fileStorage: FileStorageService,
    private tasksService: TasksService,
  ) {}

  @Get('steps')
  async getMySteps(@CurrentUser() user: AuthUser): Promise<ExternalStepDto[]> {
    this.assertExternal(user);
    const tasks = await this.prisma.task.findMany({
      where: { assigneeId: user.id, firmId: user.firmId, workflowRunId: { not: null } },
      select: {
        id: true, title: true, description: true, status: true, dueDate: true,
        blockedById: true, workflowRunId: true, workflowStep: true,
        attachments: { select: { id: true, filename: true, size: true } },
        workflowRun: { select: { name: true, status: true, case: { select: { ownRef: true } } } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });

    const result: ExternalStepDto[] = [];
    for (const task of tasks) {
      if (!task.workflowRun || task.workflowRun.status === 'CANCELLED') continue;
      const blocked = await this.isBlocked(task);
      const earlier = blocked
        ? []
        : await this.prisma.task.findMany({
            where: { workflowRunId: task.workflowRunId, workflowStep: { lt: task.workflowStep ?? 0 } },
            select: { workflowStep: true, attachments: { select: { id: true, filename: true, size: true } } },
            orderBy: { workflowStep: 'asc' },
          });
      result.push({
        taskId: task.id,
        title: task.title,
        instructions: task.description ?? undefined,
        status: task.status,
        dueDate: task.dueDate?.toISOString(),
        blocked,
        run: { name: task.workflowRun.name, caseRef: task.workflowRun.case.ownRef },
        inputs: earlier.flatMap((step) => step.attachments.map((att) => ({
          attachmentId: att.id, filename: att.filename, size: att.size, step: step.workflowStep ?? 0,
        }))),
        outputs: task.attachments.map((att) => ({ attachmentId: att.id, filename: att.filename, size: att.size })),
      });
    }
    return result;
  }

  @Get('files/:attachmentId')
  async downloadFile(
    @CurrentUser() user: AuthUser,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() res: Response,
  ) {
    this.assertExternal(user);
    const attachment = await this.prisma.taskAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        storagePath: true, filename: true, mimeType: true,
        task: { select: { assigneeId: true, firmId: true, workflowRunId: true, workflowStep: true } },
      },
    });
    if (!attachment || attachment.task.firmId !== user.firmId) throw new NotFoundException('ไม่พบไฟล์');

    if (attachment.task.assigneeId !== user.id) {
      // Someone else's file: only an earlier step's output, read from a later step of
      // the same run that the caller holds and that is no longer waiting.
      if (!attachment.task.workflowRunId) throw new NotFoundException('ไม่พบไฟล์');
      const mySteps = await this.prisma.task.findMany({
        where: {
          assigneeId: user.id,
          workflowRunId: attachment.task.workflowRunId,
          workflowStep: { gt: attachment.task.workflowStep ?? 0 },
        },
        select: { id: true, status: true, blockedById: true, workflowRunId: true, workflowStep: true },
      });
      const unblocked = await Promise.all(mySteps.map((step) => this.isBlocked(step).then((b) => !b)));
      if (!unblocked.some(Boolean)) throw new NotFoundException('ไม่พบไฟล์');
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', safeMimeType(attachment.mimeType));
    res.setHeader('Content-Disposition', buildContentDispositionHeader(attachment.filename));
    const stream = await this.fileStorage.openDownloadStream(attachment.storagePath);
    stream.on('error', (err: Error) => {
      this.logger.warn(`External download failed for ${attachment.storagePath}: ${err.message}`);
      res.destroy(err);
    });
    stream.pipe(res);
  }

  @Post('steps/:taskId/files')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.assertExternal(user);
    if (!file) throw new BadRequestException('กรุณาแนบไฟล์');
    if (!TASK_ATTACHMENT_MIME_TYPES.has(file.mimetype)) throw new BadRequestException('รองรับเฉพาะ PDF, รูปภาพ, DOCX, XLSX, TXT');
    if (file.size > TASK_ATTACHMENT_MAX_BYTES) throw new BadRequestException('ไฟล์มีขนาดใหญ่เกิน 30MB');

    const task = await this.myOpenStep(user, taskId);
    const filename = decodeUploadFilename(file.originalname);
    const ext = path.extname(filename).toLowerCase().slice(0, 10);
    // The storage key never contains the user's filename.
    const key = path.posix.join('tasks', task.id, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    const storagePath = await this.fileStorage.put(key, file.buffer, file.mimetype);
    try {
      const attachment = await this.prisma.taskAttachment.create({
        data: { taskId: task.id, filename, storagePath, size: file.size, mimeType: file.mimetype, uploadedById: user.id },
      });
      return { id: attachment.id, filename: attachment.filename, size: attachment.size };
    } catch (error) {
      await this.fileStorage.delete(storagePath).catch(() => undefined);
      throw error;
    }
  }

  @Delete('files/:attachmentId')
  async deleteFile(@CurrentUser() user: AuthUser, @Param('attachmentId', ParseUUIDPipe) attachmentId: string) {
    this.assertExternal(user);
    const attachment = await this.prisma.taskAttachment.findUnique({
      where: { id: attachmentId },
      select: { storagePath: true, uploadedById: true, taskId: true, task: { select: { firmId: true } } },
    });
    if (!attachment || attachment.task.firmId !== user.firmId || attachment.uploadedById !== user.id) {
      throw new NotFoundException('ไม่พบไฟล์');
    }
    await this.myOpenStep(user, attachment.taskId);
    await this.prisma.taskAttachment.delete({ where: { id: attachmentId } });
    await this.fileStorage.delete(attachment.storagePath).catch((err: Error) => this.logger.warn(`Orphaned ${attachment.storagePath}: ${err.message}`));
    return { deleted: true };
  }

  @Post('steps/:taskId/done')
  async completeStep(@CurrentUser() user: AuthUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    this.assertExternal(user);
    const task = await this.myOpenStep(user, taskId);
    if (await this.isBlocked(task)) throw new BadRequestException('ยังทำไม่ได้ — รอขั้นก่อนหน้าเสร็จก่อน');
    await this.tasksService.completeWorkflowStep(taskId, user);
    return { completed: true };
  }

  private assertExternal(user: AuthUser) {
    if (user.firmRole !== FirmRole.EXTERNAL) throw new ForbiddenException('หน้านี้สำหรับผู้รับงานภายนอก');
  }

  /** The caller's own workflow step in their firm, still open (not done, not waiting for review). */
  private async myOpenStep(user: AuthUser, taskId: string): Promise<StepRow> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, assigneeId: user.id, firmId: user.firmId, workflowRunId: { not: null } },
      select: { id: true, status: true, blockedById: true, workflowRunId: true, workflowStep: true },
    });
    if (!task) throw new NotFoundException('ไม่พบงานนี้');
    if (task.status === TaskStatus.DONE || task.status === TaskStatus.PENDING_REVIEW) {
      throw new BadRequestException('ส่งงานนี้ไปแล้ว');
    }
    return task;
  }

  /** A step waits until the step before it is DONE. */
  private async isBlocked(task: Pick<StepRow, 'blockedById'>): Promise<boolean> {
    if (!task.blockedById) return false;
    const before = await this.prisma.task.findUnique({ where: { id: task.blockedById }, select: { status: true } });
    return before?.status !== TaskStatus.DONE;
  }
}
