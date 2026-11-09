import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CaseAccessService } from '../common/services/case-access.service';
import { TasksService } from './tasks.service';
import { TaskSkipController } from './tasks.controller';
import { SkipTaskDto } from './dto/skip-task.dto';

const user = { id: 'u1', firmId: 'f1', firmRole: FirmRole.LAWYER } as AuthUser;

describe('Task skip endpoint', () => {
  const prisma = { task: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() }, case: { findFirst: jest.fn(), findUnique: jest.fn() }, taskObserver: { findFirst: jest.fn() } };
  const access = new CaseAccessService(prisma as any);
  const service = new TasksService(prisma as any, access, {} as any, {} as any, {} as any);

  beforeEach(() => jest.resetAllMocks());

  it('returns 404 for another firm even for a case member', async () => {
    prisma.task.findUnique.mockResolvedValue({ id: 't', firmId: 'other', caseId: 'c', status: 'TODO', assigneeId: user.id });
    await expect(service.skip('t', user, { reason: 'ไม่เกี่ยวข้อง' })).rejects.toThrow(NotFoundException);
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('returns 404 for a task without case access or delivered-task access', async () => {
    prisma.task.findUnique.mockResolvedValue({ id: 't', firmId: 'f1', caseId: 'c', status: 'TODO', assigneeId: user.id });
    prisma.case.findFirst.mockResolvedValue(null);
    prisma.task.findFirst.mockResolvedValue(null);
    await expect(service.skip('t', user, { reason: 'ไม่เกี่ยวข้อง' })).rejects.toThrow(NotFoundException);
    expect(prisma.case.findFirst).toHaveBeenCalledWith({ where: { id: 'c', ...access.getCaseFilterForUser(user) }, select: { id: true } });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('returns 404 for an inaccessible standalone task in the same firm', async () => {
    prisma.task.findUnique.mockResolvedValue({ id: 't', firmId: 'f1', caseId: null, status: 'TODO', assigneeId: 'other', createdById: 'other' });
    prisma.task.findFirst.mockResolvedValueOnce({ id: 't' }).mockResolvedValueOnce(null);
    prisma.taskObserver.findFirst.mockResolvedValue(null);
    await expect(service.skip('t', user, { reason: 'ไม่เกี่ยวข้อง' })).rejects.toThrow(NotFoundException);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing task', async () => {
    prisma.task.findUnique.mockResolvedValue(null);
    await expect(service.skip('t', user, { reason: 'ไม่เกี่ยวข้อง' })).rejects.toThrow(NotFoundException);
  });

  it.each([undefined, null, '', '  ', 'ab', '  ab  ', 'x'.repeat(501), '😀😀', 123])('requires a trimmed reason of 3–500 characters: %j', async (reason) => {
    prisma.task.findUnique.mockResolvedValue({ id: 't', firmId: 'f1', caseId: 'c', status: 'TODO', assigneeId: user.id });
    prisma.case.findFirst.mockResolvedValue({ id: 'c' });
    await expect(service.skip('t', user, { reason } as SkipTaskDto)).rejects.toThrow(BadRequestException);
    expect(await validate(plainToInstance(SkipTaskDto, { reason }))).not.toHaveLength(0);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it.each(['abc', 'x'.repeat(500), '😀😀😀', '😀'.repeat(500)])('accepts boundary length %s', async (reason) => {
    expect(await validate(plainToInstance(SkipTaskDto, { reason }))).toHaveLength(0);
    prisma.task.findUnique.mockResolvedValue({ id: 't', firmId: 'f1', caseId: 'c', status: 'TODO', assigneeId: user.id });
    prisma.case.findFirst.mockResolvedValue({ id: 'c' });
    await service.skip('t', user, { reason });
    expect(prisma.task.update).toHaveBeenCalled();
  });

  it('records the skip actor, date and trimmed reason without marking work DONE', async () => {
    prisma.task.findUnique.mockResolvedValue({ id: 't', firmId: 'f1', caseId: 'c', status: 'TODO' });
    prisma.case.findFirst.mockResolvedValue({ id: 'c' });
    const saved = { id: 't', status: 'TODO', skippedReason: 'ไม่เกี่ยวข้อง', skippedAt: new Date(), skippedById: 'u1' };
    prisma.task.update.mockResolvedValue(saved);
    expect(await service.skip('t', user, { reason: '  ไม่เกี่ยวข้อง  ' })).toBe(saved);
    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: 't' }, data: { skippedReason: 'ไม่เกี่ยวข้อง', skippedAt: expect.any(Date), skippedById: 'u1' }, select: { id: true, status: true, skippedReason: true, skippedAt: true, skippedById: true } });
  });

  it('supports an accessible personal task under existing ownership rules', async () => {
    prisma.task.findUnique.mockResolvedValue({ id: 't', firmId: 'f1', caseId: null, status: 'TODO', assigneeId: user.id });
    prisma.task.findFirst.mockResolvedValue({ id: 't' });
    await service.skip('t', user, { reason: 'ซ้ำกับงานอื่น' });
    expect(prisma.task.update).toHaveBeenCalled();
  });

  it('refuses a case member who cannot change another lawyer’s task status', async () => {
    prisma.task.findUnique.mockResolvedValue({ id: 't', firmId: 'f1', caseId: 'c', status: 'TODO', assigneeId: 'other' });
    prisma.case.findFirst.mockResolvedValue({ id: 'c' });
    prisma.case.findUnique.mockResolvedValue({ id: 'c', leadLawyerId: 'lead' });
    await expect(service.skip('t', user, { reason: 'ไม่เกี่ยวข้อง' })).rejects.toThrow(ForbiddenException);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('requires current case access even for a former assignee with delivered-task visibility', async () => {
    prisma.task.findUnique.mockResolvedValue({ id: 't', firmId: 'f1', caseId: 'c', status: 'PENDING_REVIEW', assigneeId: 'reviewer' });
    prisma.case.findFirst.mockResolvedValue(null);
    prisma.task.findFirst.mockResolvedValue({ id: 't' });
    await expect(service.skip('t', user, { reason: 'ไม่เกี่ยวข้อง' })).rejects.toThrow(NotFoundException);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it.each(['DONE', 'PENDING_REVIEW'])('refuses skipping a %s task', async (status) => {
    prisma.task.findUnique.mockResolvedValue({ id: 't', firmId: 'f1', caseId: 'c', status, assigneeId: user.id });
    prisma.case.findFirst.mockResolvedValue({ id: 'c' });
    await expect(service.skip('t', user, { reason: 'ไม่เกี่ยวข้อง' })).rejects.toThrow(BadRequestException);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('refuses overwriting a previous skip', async () => {
    prisma.task.findUnique.mockResolvedValue({ id: 't', firmId: 'f1', caseId: 'c', status: 'TODO', assigneeId: user.id, skippedReason: 'เหตุผลเดิม', skippedAt: new Date() });
    prisma.case.findFirst.mockResolvedValue({ id: 'c' });
    await expect(service.skip('t', user, { reason: 'เหตุผลใหม่' })).rejects.toThrow(BadRequestException);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it.each(['TODO', 'IN_PROGRESS', 'NEEDS_REVISION'])('allows skipping an owned %s task', async (status) => {
    prisma.task.findUnique.mockResolvedValue({ id: 't', firmId: 'f1', caseId: 'c', status, assigneeId: user.id });
    prisma.case.findFirst.mockResolvedValue({ id: 'c' });
    await service.skip('t', user, { reason: 'ไม่เกี่ยวข้อง' });
    expect(prisma.task.update).toHaveBeenCalled();
  });

  it.each([FirmRole.LAWYER, FirmRole.OWNER])('allows a case lead or %s with status edit authority to skip another assignee’s task', async (firmRole) => {
    prisma.task.findUnique.mockResolvedValue({ id: 't', firmId: 'f1', caseId: 'c', status: 'TODO', assigneeId: 'other' });
    prisma.case.findFirst.mockResolvedValue({ id: 'c' });
    prisma.case.findUnique.mockResolvedValue({ id: 'c', leadLawyerId: firmRole === FirmRole.LAWYER ? user.id : 'lead' });
    await service.skip('t', { ...user, firmRole }, { reason: 'ไม่เกี่ยวข้อง' });
    expect(prisma.task.update).toHaveBeenCalled();
  });

  it('does not let a standalone-task observer skip another assignee’s work', async () => {
    prisma.task.findUnique.mockResolvedValue({ id: 't', firmId: 'f1', caseId: null, status: 'TODO', assigneeId: 'other', createdById: 'other' });
    prisma.task.findFirst.mockResolvedValue({ id: 't' });
    prisma.taskObserver.findFirst.mockResolvedValue({ id: 'observer' });
    await expect(service.skip('t', user, { reason: 'ไม่เกี่ยวข้อง' })).rejects.toThrow(ForbiddenException);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('controller forwards only the authenticated actor and validated body', async () => {
    const mock = { skip: jest.fn() };
    new TaskSkipController(mock as any).skip(user, 't', { reason: 'ไม่เกี่ยวข้อง' });
    expect(mock.skip).toHaveBeenCalledWith('t', user, { reason: 'ไม่เกี่ยวข้อง' });
    expect(Reflect.getMetadata('path', TaskSkipController)).toBe('tasks');
    expect(Reflect.getMetadata('path', TaskSkipController.prototype.skip)).toBe(':id/skip');
  });
});
