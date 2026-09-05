import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaskSource } from '../generated/prisma';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';
import { StartTaskOnHoldDto, UpdateTaskOnHoldDto } from './dto/task-on-hold.dto';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  private taskInclude = {
    assignee: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    createdBy: {
      select: { id: true, firstName: true, lastName: true },
    },
  };

  async findByCase(caseId: string) {
    return this.prisma.task.findMany({
      where: { caseId },
      include: this.taskInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findMine(user: AuthUser) {
    return this.prisma.task.findMany({
      where: { caseId: null, assigneeId: user.id },
      include: this.taskInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async assertStandaloneOwnership(id: string, user: AuthUser) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task || task.caseId !== null) throw new NotFoundException('Task not found');
    if (task.assigneeId !== user.id && task.createdById !== user.id) {
      throw new ForbiddenException('You do not have access to this task');
    }
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: this.taskInclude,
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async create(
    user: AuthUser,
    caseId: string | null,
    dto: CreateTaskDto,
    source: TaskSource = TaskSource.WEB,
  ) {
    return this.prisma.task.create({
      data: {
        caseId,
        title: dto.title,
        description: dto.description,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status,
        createdById: user.id,
        source,
      },
      include: this.taskInclude,
    });
  }

  async update(id: string, dto: UpdateTaskDto) {
    await this.findOne(id);
    return this.prisma.task.update({
      where: { id },
      data: {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: this.taskInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.task.delete({ where: { id } });
    return { deleted: true };
  }

  async startOnHold(taskId: string, user: AuthUser, dto: StartTaskOnHoldDto) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { onHold: true },
    });
    if (!task) {
      throw new NotFoundException('ไม่พบงานนี้');
    }
    if (task.onHold && !task.onHold.endedAt) {
      throw new BadRequestException('งานนี้อยู่ในสถานะ On hold อยู่แล้ว');
    }

    return this.prisma.taskOnHold.create({
      data: {
        taskId,
        reason: dto.reason,
        followerUserId: dto.followerUserId,
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined,
        createdById: user.id,
      },
    });
  }

  async updateOnHold(taskId: string, dto: UpdateTaskOnHoldDto) {
    const hold = await this.prisma.taskOnHold.findUnique({ where: { taskId } });
    if (!hold || hold.endedAt) {
      throw new NotFoundException('ไม่พบสถานะ On hold ที่ยังใช้งานอยู่สำหรับงานนี้');
    }

    return this.prisma.taskOnHold.update({
      where: { id: hold.id },
      data: {
        followerUserId: dto.followerUserId ?? hold.followerUserId,
        lastFollowUpAt: dto.lastFollowUpAt ? new Date(dto.lastFollowUpAt) : hold.lastFollowUpAt,
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : hold.nextFollowUpAt,
        notes: dto.notes ?? hold.notes,
      },
    });
  }

  async resumeFromOnHold(taskId: string) {
    const hold = await this.prisma.taskOnHold.findUnique({ where: { taskId } });
    if (!hold) {
      throw new NotFoundException('ไม่พบสถานะ On hold สำหรับงานนี้');
    }
    if (hold.endedAt) {
      throw new BadRequestException('งานนี้ไม่ได้อยู่ในสถานะ On hold');
    }

    return this.prisma.taskOnHold.update({
      where: { id: hold.id },
      data: { endedAt: new Date() },
    });
  }
}
