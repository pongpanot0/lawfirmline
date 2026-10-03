import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowExternal } from '../common/decorators/allow-external.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { FileStorageService } from '../common/services/file-storage.service';
import { TasksService } from '../tasks/tasks.service';
import { ExternalStepDto } from './dto/workflow.dto';
import { TaskStatus } from '../generated/prisma';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

@Controller('external')
@UseGuards(JwtAuthGuard)
@AllowExternal()
export class ExternalController {
  constructor(
    private prisma: PrismaService,
    private fileStorage: FileStorageService,
    private tasksService: TasksService,
  ) {}

  // ===== List My Steps =====

  @Get('steps')
  async getMySteps(@CurrentUser() user: AuthUser): Promise<ExternalStepDto[]> {
    if (user.firmRole !== FirmRole.EXTERNAL) {
      throw new ForbiddenException('Only external users can access this');
    }

    const tasks = await this.prisma.task.findMany({
      where: {
        assigneeId: user.id,
        firmId: user.firmId,
        workflowRunId: { not: null },
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        dueDate: true,
        blockedById: true,
        workflowRunId: true,
        workflowStep: true,
        attachments: {
          select: { id: true, filename: true, size: true },
        },
        workflowRun: {
          select: {
            id: true,
            name: true,
            case: {
              select: { ownRef: true },
            },
            tasks: {
              select: {
                workflowStep: true,
                attachments: {
                  select: { id: true, filename: true, size: true },
                },
              },
              where: { workflowStep: { lt: 0 } }, // Placeholder, will fix
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Load previous step attachments more carefully
    const result: ExternalStepDto[] = [];
    for (const task of tasks) {
      if (!task.workflowRun) continue;

      const blocked = task.blockedById ? await this.prisma.task.findUnique({ where: { id: task.blockedById }, select: { status: true } }) : null;
      const isBlocked = !!task.blockedById && blocked?.status !== TaskStatus.DONE;

      const prevStepAttachments = !isBlocked
        ? await this.prisma.task.findMany({
            where: {
              workflowRunId: task.workflowRunId,
              workflowStep: { lt: task.workflowStep ?? 0 },
            },
            select: {
              workflowStep: true,
              attachments: {
                select: { id: true, filename: true, size: true },
              },
            },
            orderBy: { workflowStep: 'asc' },
          })
        : [];

      result.push({
        taskId: task.id,
        title: task.title,
        instructions: task.description ?? undefined,
        status: task.status,
        dueDate: task.dueDate?.toISOString(),
        blocked: isBlocked,
        run: {
          name: task.workflowRun.name,
          caseRef: task.workflowRun.case.ownRef,
        },
        inputs: prevStepAttachments.flatMap((step: any) =>
          (step.attachments ?? []).map((att: any) => ({
            attachmentId: att.id,
            filename: att.filename,
            size: att.size,
            step: step.workflowStep ?? 0,
          })),
        ),
        outputs: task.attachments.map((att: any) => ({
          attachmentId: att.id,
          filename: att.filename,
          size: att.size,
        })),
      });
    }

    return result;
  }

  // ===== Download File =====

  @Get('files/:attachmentId')
  async downloadFile(@CurrentUser() user: AuthUser, @Param('attachmentId') attachmentId: string): Promise<StreamableFile> {
    if (user.firmRole !== FirmRole.EXTERNAL) {
      throw new ForbiddenException('Only external users can access this');
    }

    const attachment = await this.prisma.taskAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        storagePath: true,
        filename: true,
        mimeType: true,
        task: {
          select: {
            assigneeId: true,
            workflowRunId: true,
            workflowStep: true,
            firmId: true,
          },
        },
      },
    });

    if (!attachment) throw new NotFoundException('File not found');
    if (attachment.task.firmId !== user.firmId) throw new ForbiddenException();

    // Check: own task, or earlier step of same run (and not blocked)
    if (attachment.task.assigneeId === user.id) {
      // Own task - allow
    } else if (attachment.task.workflowRunId) {
      // Check if user has an unblocked later step
      const mySteps = await this.prisma.task.findMany({
        where: {
          assigneeId: user.id,
          workflowRunId: attachment.task.workflowRunId,
        },
        select: {
          workflowStep: true,
          blockedById: true,
        },
      });
      const hasAccess = mySteps.some(
        (s) =>
          (s.workflowStep ?? 0) > (attachment.task.workflowStep ?? 0) &&
          !s.blockedById,
      );
      if (!hasAccess) throw new ForbiddenException();
    } else {
      throw new ForbiddenException();
    }

    const buffer = await this.fileStorage.getBuffer(attachment.storagePath);
    return new StreamableFile(buffer, {
      type: attachment.mimeType,
      disposition: `attachment; filename="${attachment.filename}"`,
    });
  }

  // ===== Upload File =====

  @Post('steps/:taskId/files')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (user.firmRole !== FirmRole.EXTERNAL) {
      throw new ForbiddenException('Only external users can access this');
    }
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File too large');
    }

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { assigneeId: true, firmId: true, status: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (task.firmId !== user.firmId) throw new ForbiddenException();
    if (task.assigneeId !== user.id) throw new ForbiddenException();
    if (task.status === TaskStatus.DONE) throw new BadRequestException('Task is complete');

    // Use existing file storage pattern
    const filename = decodeURIComponent(
      file.originalname.replace(/[^a-z0-9._-]/gi, '_'),
    );
    const storagePath = `tasks/${taskId}/${Date.now()}-${filename}`;

    await this.fileStorage.put(storagePath, file.buffer, file.mimetype);

    const attachment = await this.prisma.taskAttachment.create({
      data: {
        taskId,
        filename,
        storagePath,
        size: file.size,
        mimeType: file.mimetype,
        uploadedById: user.id,
      },
    });

    return { id: attachment.id, filename: attachment.filename, size: attachment.size };
  }

  // ===== Delete File =====

  @Delete('files/:attachmentId')
  async deleteFile(@CurrentUser() user: AuthUser, @Param('attachmentId') attachmentId: string) {
    if (user.firmRole !== FirmRole.EXTERNAL) {
      throw new ForbiddenException('Only external users can access this');
    }

    const attachment = await this.prisma.taskAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        storagePath: true,
        uploadedById: true,
        task: { select: { assigneeId: true, firmId: true, status: true } },
      },
    });
    if (!attachment) throw new NotFoundException('File not found');
    if (attachment.task.firmId !== user.firmId) throw new ForbiddenException();
    if (attachment.uploadedById !== user.id) throw new ForbiddenException('Can only delete your own files');
    if (attachment.task.status === TaskStatus.DONE) throw new BadRequestException('Cannot delete from completed task');

    await this.fileStorage.delete(attachment.storagePath);
    await this.prisma.taskAttachment.delete({ where: { id: attachmentId } });

    return { deleted: true };
  }

  // ===== Complete Step =====

  @Post('steps/:taskId/done')
  async completeStep(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string) {
    if (user.firmRole !== FirmRole.EXTERNAL) {
      throw new ForbiddenException('Only external users can access this');
    }

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        assigneeId: true,
        firmId: true,
        status: true,
        blockedById: true,
        requiresReview: true,
        reviewerId: true,
        caseId: true,
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (task.firmId !== user.firmId) throw new ForbiddenException();
    if (task.assigneeId !== user.id) throw new ForbiddenException();
    if (task.status === TaskStatus.DONE) throw new BadRequestException('Already complete');

    // Check not blocked
    if (task.blockedById) {
      const blocker = await this.prisma.task.findUnique({
        where: { id: task.blockedById },
        select: { status: true },
      });
      if (blocker?.status !== TaskStatus.DONE) {
        throw new BadRequestException('Task is blocked by earlier step');
      }
    }

    // Use dedicated method for workflow step completion
    await this.tasksService.completeWorkflowStep(taskId, user);

    return { completed: true };
  }
}
