import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
import { AuthUser, FirmRole, TaskPriority, TaskStatus, dailyTaskUpdateText } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { FileStorageService } from '../common/services/file-storage.service';
import { decodeUploadFilename } from '../common/utils/decode-upload-filename';
import { TasksService } from './tasks.service';
import { CreateSubtaskDto, CreateTaskCommentDto } from './dto/task-detail.dto';
import { DailyTaskUpdateDto } from './dto/task-daily-update.dto';

export const TASK_ATTACHMENT_MAX_BYTES = 30 * 1024 * 1024;
export const TASK_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

const person = { select: { id: true, firstName: true, lastName: true } };

@Injectable()
export class TaskDetailService {
  private readonly logger = new Logger(TaskDetailService.name);

  constructor(
    private prisma: PrismaService,
    private tasks: TasksService,
    private fileStorage: FileStorageService,
  ) {}

  async getDetail(taskId: string, user: AuthUser) {
    await this.tasks.assertAccess(taskId, user);
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: person,
        createdBy: person,
        onHold: true,
        parent: { select: { id: true, title: true } },
        case: { select: { id: true, ownRef: true, title: true } },
        subtasks: {
          orderBy: { createdAt: 'asc' },
          include: { assignee: person },
        },
        attachments: {
          orderBy: { createdAt: 'asc' },
          include: { uploadedBy: person },
        },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { author: person },
        },
        assignmentLogs: {
          orderBy: { createdAt: 'asc' },
          include: { fromUser: person, toUser: person, performedBy: person },
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async createSubtask(taskId: string, user: AuthUser, dto: CreateSubtaskDto) {
    const parent = await this.tasks.assertAccess(taskId, user);
    if (parent.parentId) {
      throw new BadRequestException('งานย่อยมีได้ชั้นเดียว สร้างงานย่อยจากงานหลักเท่านั้น');
    }
    const created = await this.tasks.create(user, parent.caseId, { ...dto, title: dto.title.trim(), priority: dto.priority ?? TaskPriority.MEDIUM }, undefined, parent.intakeId ?? undefined);
    await this.prisma.task.update({ where: { id: created.id }, data: { parentId: parent.id } });
    return this.tasks.findOne(created.id);
  }

  acknowledge(taskId: string, user: AuthUser) {
    return this.tasks.acknowledge(taskId, user);
  }

  async confirmPlan(taskId: string, user: AuthUser, date: string) {
    const task = await this.tasks.assertAccess(taskId, user);
    if (task.assigneeId !== user.id || [TaskStatus.PENDING_REVIEW, TaskStatus.DONE].includes(task.status as TaskStatus)) throw new ForbiddenException('ยืนยันแผนได้เฉพาะงานของตัวเองที่ยังทำอยู่');
    const result = await this.prisma.task.updateMany({ where: { id: taskId, assigneeId: user.id, status: task.status }, data: { scheduledFor: new Date(`${date}T00:00:00Z`), planConfirmedAt: new Date() } });
    if (!result.count) throw new BadRequestException('งานเปลี่ยนแล้ว กรุณาโหลดใหม่');
    return this.tasks.findOne(taskId);
  }

  async dailyUpdate(taskId: string, user: AuthUser, dto: DailyTaskUpdateDto) {
    const task = await this.tasks.assertAccess(taskId, user);
    if (task.assigneeId !== user.id || [TaskStatus.PENDING_REVIEW, TaskStatus.DONE].includes(task.status as TaskStatus)) {
      throw new ForbiddenException('ผู้ทำงานอัปเดตความคืบหน้าได้เฉพาะงานของตัวเองที่ยังไม่ส่งตรวจหรือเสร็จ');
    }
    if (!dto.completed.trim() || !dto.remaining.trim()) throw new BadRequestException('ระบุว่าทำถึงไหนและเหลืออะไร');
    return this.prisma.taskComment.create({
      data: { taskId, authorId: user.id, kind: 'DAILY_UPDATE', body: dailyTaskUpdateText(dto) },
      include: { author: person },
    });
  }

  async addComment(taskId: string, user: AuthUser, dto: CreateTaskCommentDto) {
    await this.tasks.assertAccess(taskId, user);
    return this.prisma.taskComment.create({
      data: { taskId, authorId: user.id, body: dto.body.trim() },
      include: { author: person },
    });
  }

  async deleteComment(taskId: string, commentId: string, user: AuthUser) {
    await this.tasks.assertAccess(taskId, user);
    const comment = await this.prisma.taskComment.findFirst({ where: { id: commentId, taskId } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== user.id && user.firmRole !== FirmRole.OWNER) {
      throw new ForbiddenException('ลบได้เฉพาะความคิดเห็นของตัวเอง');
    }
    await this.prisma.taskComment.delete({ where: { id: commentId } });
    return { deleted: true };
  }

  async uploadAttachment(taskId: string, user: AuthUser, file: Express.Multer.File | undefined) {
    await this.tasks.assertAccess(taskId, user);
    if (!file) throw new BadRequestException('กรุณาแนบไฟล์');
    if (!TASK_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('รองรับเฉพาะ PDF, รูปภาพ, DOCX, XLSX, TXT');
    }
    if (file.size > TASK_ATTACHMENT_MAX_BYTES) {
      throw new BadRequestException('ไฟล์มีขนาดใหญ่เกิน 30MB');
    }
    const filename = decodeUploadFilename(file.originalname);
    const ext = path.extname(filename).toLowerCase().slice(0, 10);
    const key = path.posix.join(
      'tasks',
      taskId,
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`,
    );
    const storagePath = await this.fileStorage.put(key, file.buffer, file.mimetype);
    try {
      return await this.prisma.taskAttachment.create({
        data: {
          taskId,
          filename,
          storagePath,
          mimeType: file.mimetype,
          size: file.size,
          uploadedById: user.id,
        },
        include: { uploadedBy: person },
      });
    } catch (error) {
      // No row means no way to ever delete the bytes from the UI; clean up now.
      try {
        await this.fileStorage.delete(storagePath);
      } catch {
        // best-effort cleanup; the original error is what matters to the caller
      }
      throw error;
    }
  }

  async deleteAttachment(taskId: string, attachmentId: string, user: AuthUser) {
    await this.tasks.assertAccess(taskId, user);
    const attachment = await this.prisma.taskAttachment.findFirst({ where: { id: attachmentId, taskId } });
    if (!attachment) throw new NotFoundException('Attachment not found');
    if (attachment.uploadedById !== user.id && user.firmRole !== FirmRole.OWNER) {
      throw new ForbiddenException('ลบได้เฉพาะไฟล์ที่ตัวเองอัปโหลด');
    }
    try {
      await this.fileStorage.delete(attachment.storagePath);
    } catch (err) {
      this.logger.warn(`Failed to remove ${attachment.storagePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
    await this.prisma.taskAttachment.delete({ where: { id: attachmentId } });
    return { deleted: true };
  }

  async getAttachmentForDownload(taskId: string, attachmentId: string, user: AuthUser) {
    await this.tasks.assertAccess(taskId, user);
    const attachment = await this.prisma.taskAttachment.findFirst({ where: { id: attachmentId, taskId } });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return { storagePath: attachment.storagePath, filename: attachment.filename, mimeType: attachment.mimeType };
  }
}
