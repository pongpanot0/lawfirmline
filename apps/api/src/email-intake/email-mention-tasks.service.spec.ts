import { BadRequestException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { EmailMentionTasksService, matchMentionsToMembers } from './email-mention-tasks.service';

const ORANAN = { id: 'u-oranan', email: 'oranan@siambarristers.com', firstName: 'Oranan', lastName: 'Yubolpled' };
const SUCHANYA = { id: 'u-suchanya', email: 'suchanya.u@firm.local', firstName: 'Suchanya', lastName: 'Umoung' };
const BO_1 = { id: 'u-bo1', email: 'bo1@x.com', firstName: 'โบ', lastName: 'หนึ่ง' };
const BO_2 = { id: 'u-bo2', email: 'bo2@x.com', firstName: 'โบ', lastName: 'สอง' };

describe('matchMentionsToMembers', () => {
  it('matches by email, then full name, then a first name only one member has', () => {
    const result = matchMentionsToMembers(
      [
        { email: 'oranan@siambarristers.com', name: 'whatever' },
        { email: 'suchanya@siambarristers.com', name: 'Suchanya  Umoung' },
        { email: 'oranan.alias@gmail.com', name: 'oranan' },
        { email: 'bo@x.com', name: 'โบ' },
        { email: 'nobody@x.com', name: 'Nobody' },
      ],
      [ORANAN, SUCHANYA, BO_1, BO_2],
    );
    expect(Object.fromEntries([...result].map(([k, v]) => [k, v.id]))).toEqual({
      'oranan@siambarristers.com': 'u-oranan',
      'suchanya@siambarristers.com': 'u-suchanya',
      'oranan.alias@gmail.com': 'u-oranan',
    });
  });
});

describe('EmailMentionTasksService.createTask', () => {
  const user = { id: 'u-boss', firmId: 'f1' } as AuthUser;
  const html = `<div><a href="mailto:oranan@siambarristers.com">@Oranan Yubolpled</a> ทำใบแต่งทนาย ภายใน 21/9/2569</div>`;
  let prisma: any;
  let tasks: any;
  let service: EmailMentionTasksService;

  beforeEach(() => {
    prisma = {
      emailMessage: { findFirst: jest.fn().mockResolvedValue({ id: 'm1', bodyHtml: html, fromName: 'Weerayuth', fromAddress: null, thread: { subject: 'Uniqlo' } }) },
      firmMember: { findMany: jest.fn().mockResolvedValue([{ user: ORANAN }]) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
    };
    tasks = { create: jest.fn().mockResolvedValue({ id: 't-new' }), findOne: jest.fn().mockResolvedValue({ id: 't-old' }) };
    const caseAccess = { getEmailThreadFilterForUser: jest.fn().mockResolvedValue({}) };
    service = new EmailMentionTasksService(prisma, caseAccess as any, tasks);
  });

  it('creates the task with a per-email-per-person request key and the sender in the description', async () => {
    await service.createTask(user, 'c1', 'm1', { assigneeId: 'u-oranan', title: 'ทำใบแต่งทนาย', dueDate: '2026-09-21' });
    expect(tasks.create).toHaveBeenCalledWith(user, 'c1', expect.objectContaining({
      title: 'ทำใบแต่งทนาย',
      assigneeId: 'u-oranan',
      dueDate: '2026-09-21',
      createRequestId: 'email-mention:m1:u-oranan',
      description: expect.stringContaining('สั่งงานทางอีเมลโดย Weerayuth'),
    }));
  });

  it('returns the existing task on a second confirm', async () => {
    prisma.task.findMany.mockResolvedValue([{ id: 't-old', createRequestId: 'email-mention:m1:u-oranan' }]);
    await expect(service.createTask(user, 'c1', 'm1', { assigneeId: 'u-oranan', title: 'x' })).resolves.toEqual({ id: 't-old' });
    expect(tasks.create).not.toHaveBeenCalled();
  });

  it('refuses someone the email did not @mention', async () => {
    await expect(service.createTask(user, 'c1', 'm1', { assigneeId: 'u-other', title: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
