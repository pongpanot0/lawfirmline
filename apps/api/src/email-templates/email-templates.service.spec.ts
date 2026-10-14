import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.module';
import { TemplatesService } from '../templates/templates.service';
import { EmailTemplatesService } from './email-templates.service';

const user = { id: 'u1', firmId: 'f1', firstName: 'สมชาย', lastName: 'ใจดี' } as never;

describe('EmailTemplatesService', () => {
  const prisma = {
    emailTemplate: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const templates = { caseVariables: jest.fn() };
  let service: EmailTemplatesService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        EmailTemplatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: TemplatesService, useValue: templates },
      ],
    }).compile();
    service = module.get(EmailTemplatesService);
  });

  it('lists built-ins first then firm rows, scoped to the firm', async () => {
    prisma.emailTemplate.findMany.mockResolvedValue([{ id: 't1', name: 'ก', subject: 's', body: 'b', firmId: 'f1' }]);
    const list = await service.list('f1');
    expect(prisma.emailTemplate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { firmId: 'f1' } }));
    expect(list.slice(0, 3).every((t) => t.builtIn && t.id.startsWith('builtin:'))).toBe(true);
    expect(list[3]).toEqual({ id: 't1', name: 'ก', subject: 's', body: 'b', builtIn: false });
  });

  it('create stores createdById and audits', async () => {
    prisma.emailTemplate.create.mockResolvedValue({ id: 't1', name: 'n', subject: 's', body: 'b' });
    await service.create(user, { name: 'n', subject: 's', body: 'b' });
    expect(prisma.emailTemplate.create).toHaveBeenCalledWith({
      data: { firmId: 'f1', name: 'n', subject: 's', body: 'b', createdById: 'u1' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ firmId: 'f1', userId: 'u1', action: 'EMAIL_TEMPLATE_CREATED' }) }),
    );
  });

  it('update/delete refuse built-ins and other firms rows', async () => {
    await expect(service.update(user, 'builtin:court-hearing', { name: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.remove(user, 'builtin:court-hearing')).rejects.toBeInstanceOf(BadRequestException);
    prisma.emailTemplate.findFirst.mockResolvedValue(null);
    await expect(service.update(user, 'other', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.emailTemplate.findFirst).toHaveBeenCalledWith({ where: { id: 'other', firmId: 'f1' } });
    await expect(service.remove(user, 'other')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update and delete audit', async () => {
    prisma.emailTemplate.findFirst.mockResolvedValue({ id: 't1', name: 'n' });
    prisma.emailTemplate.update.mockResolvedValue({ id: 't1', name: 'm', subject: 's', body: 'b' });
    await service.update(user, 't1', { name: 'm' });
    await service.remove(user, 't1');
    const actions = prisma.auditLog.create.mock.calls.map((c) => c[0].data.action);
    expect(actions).toEqual(['EMAIL_TEMPLATE_UPDATED', 'EMAIL_TEMPLATE_DELETED']);
  });

  it('render fills case vars + senderName and reports missing with Thai labels', async () => {
    prisma.emailTemplate.findFirst.mockResolvedValue({ id: 't1', subject: '[{{ownRef}}] {{nextHearingDate}}', body: 'โดย {{senderName}} {{nextHearingCourt}}' });
    templates.caseVariables.mockResolvedValue({ ownRef: 'TSB-1', nextHearingDate: '1 ธันวาคม 2569', nextHearingCourt: '' });
    const out = await service.render(user, 'case-1', 't1');
    expect(out).toEqual({
      subject: '[TSB-1] 1 ธันวาคม 2569',
      body: 'โดย สมชาย ใจดี {{nextHearingCourt}}',
      missing: [{ key: 'nextHearingCourt', label: 'ศาลที่นัด' }],
    });
  });

  it('render works for built-ins without touching the table', async () => {
    templates.caseVariables.mockResolvedValue({});
    const out = await service.render(user, 'case-1', 'builtin:court-hearing');
    expect(prisma.emailTemplate.findFirst).not.toHaveBeenCalled();
    expect(out.subject).toContain('{{ownRef}}');
    expect(out.missing.length).toBeGreaterThan(0);
  });

  it('variables lists key/label/example', () => {
    expect(service.variables()).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'senderName', label: expect.any(String), example: expect.any(String) })]));
  });
});
