import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthUser } from '@lawfirm/shared';
import { AppFeedbackService, FEEDBACK_MAX_BYTES } from './app-feedback.service';
import { CreateAppFeedbackDto, FeedbackPagesQueryDto, ResolveFeedbackDto } from './dto/app-feedback.dto';

const user = { id: 'u1', firmId: 'f1' } as AuthUser;
const input: CreateAppFeedbackDto = { kind: 'BUG', platform: 'web', message: 'ใช้งานไม่ได้' };
const screenshot = { mimetype: 'image/png', size: 3, buffer: Buffer.from('png'), originalname: 'unsafe.html' } as Express.Multer.File;

describe('AppFeedbackService', () => {
  let service: AppFeedbackService;
  let db: any;
  let storage: any;
  let line: any;
  beforeEach(() => {
    db = {
      appFeedback: { create: jest.fn().mockResolvedValue({ id: 'fb1' }), findMany: jest.fn().mockResolvedValue([]), count: jest.fn(), groupBy: jest.fn().mockResolvedValue([]), updateMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
      appFeedbackLineRound: { create: jest.fn().mockResolvedValue({ id: 'round1' }), findUnique: jest.fn().mockResolvedValue({ id: 'round1' }), findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    storage = { put: jest.fn().mockResolvedValue('stored.png'), delete: jest.fn() };
    line = { pushTo: jest.fn().mockResolvedValue(true) };
    service = new AppFeedbackService(db, storage, line);
  });

  it.each([
    { kind: 'UNKNOWN' }, { platform: 'LINE' }, { kind: 'BUG', message: '  ' },
    { kind: 'SUGGESTION', message: undefined }, { kind: 'OTHER', message: '' },
    { message: 'ก'.repeat(501) }, { message: null }, { message: 12 },
    { kind: 'RATING', rating: undefined }, { kind: 'RATING', rating: 0 },
    { kind: 'RATING', rating: 4 }, { kind: 'RATING', rating: 1.5 },
    { kind: 'RATING', rating: '2' }, { rating: 2 }, { route: 123 }, { appVersion: 12 },
  ])('rejects invalid staff input %j before storage/DB', async (patch) => {
    await expect(service.create(user, { ...input, ...patch } as any)).rejects.toThrow(BadRequestException);
    expect(db.appFeedback.create).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('requires an authenticated firm member', async () => {
    await expect(service.create({ id: 'u1' } as AuthUser, input)).rejects.toThrow(ForbiddenException);
  });

  it('uses the authenticated firm, clips metadata, and derives source', async () => {
    await expect(service.create(user, { ...input, platform: 'ios', route: '/'.repeat(310), appVersion: 'v'.repeat(45), firmId: 'evil' } as any)).resolves.toEqual({ id: 'fb1' });
    expect(db.appFeedback.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'u1', firmId: 'f1', source: 'MOBILE', route: '/'.repeat(300), appVersion: 'v'.repeat(40) }), select: { id: true } });
  });

  it.each([1, 2, 3])('accepts a bare RATING %i and normalizes whitespace messages', async (rating) => {
    await service.create(user, { kind: 'RATING', rating, platform: 'android', message: '  ' });
    expect(db.appFeedback.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ rating, message: null, source: 'MOBILE' }) }));
  });

  it.each(['image/png', 'image/jpeg', 'image/webp'])('stores allowed screenshot %s with a generated extension', async (mimetype) => {
    await service.create(user, input, { ...screenshot, mimetype, size: FEEDBACK_MAX_BYTES });
    expect(storage.put).toHaveBeenCalledWith(expect.stringMatching(/^app-feedback\/\d{4}\/[a-f0-9-]+\.(png|jpg|webp)$/), screenshot.buffer, mimetype);
  });

  it.each([
    [{ ...input, kind: 'RATING', rating: 1 }, screenshot],
    [input, { ...screenshot, size: FEEDBACK_MAX_BYTES + 1 }],
    [input, { ...screenshot, mimetype: 'image/svg+xml' }],
    [input, { ...screenshot, mimetype: 'image/heic' }],
  ])('rejects a forbidden screenshot before storing', async (dto, file) => {
    await expect(service.create(user, dto as CreateAppFeedbackDto, file)).rejects.toThrow(BadRequestException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('cleans up storage on DB failure, preserving the original error even if cleanup fails', async () => {
    db.appFeedback.create.mockRejectedValue(new Error('db down'));
    storage.delete.mockRejectedValue(new Error('cleanup down'));
    await expect(service.create(user, input, screenshot)).rejects.toThrow('db down');
    expect(storage.delete).toHaveBeenCalledWith('stored.png');
  });

  it('excludes uncommented ratings, filters and paginates without exposing storage paths', async () => {
    db.appFeedback.findMany.mockResolvedValue([
      { id: 'fb1', screenshotPath: 'secret', user: { id: 'u1', firstName: 'สม', lastName: 'ใจ' }, firm: { id: 'f1', name: 'Firm' }, kind: 'BUG' },
      { id: 'fb2' },
    ]);
    const result = await service.list({ status: 'resolved', kind: 'BUG', firmId: 'f1', q: ' broken ', cursor: 'prev', limit: 1 });
    const args = db.appFeedback.findMany.mock.calls[0][0];
    expect(args.where.AND).toContainEqual({ OR: [{ kind: { not: 'RATING' } }, { message: { not: null, notIn: [''] } }] });
    expect(args.where).toMatchObject({ kind: 'BUG', firmId: 'f1', resolvedAt: { not: null } });
    expect(args).toMatchObject({ cursor: { id: 'prev' }, skip: 1, take: 2, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    expect(result).toEqual({ items: [{ id: 'fb1', hasScreenshot: true, user: { id: 'u1', name: 'สม ใจ' }, firm: { id: 'f1', name: 'Firm' }, kind: 'BUG' }], nextCursor: 'fb1' });
  });

  it('defaults to open and returns no cursor on the last page', async () => {
    expect(await service.list({})).toEqual({ items: [], nextCursor: null });
    expect(db.appFeedback.findMany.mock.calls[0][0].where.resolvedAt).toBeNull();
    await service.list({ status: 'all' });
    expect(db.appFeedback.findMany.mock.calls[1][0].where).not.toHaveProperty('resolvedAt');
  });

  it('summary counts exactly the visible unresolved rows', async () => {
    db.appFeedback.count.mockResolvedValue(4);
    expect(await service.summary()).toEqual({ open: 4 });
    expect(db.appFeedback.count).toHaveBeenCalledWith({ where: { AND: [{ OR: [{ kind: { not: 'RATING' } }, { message: { not: null, notIn: [''] } }] }], resolvedAt: null } });
  });

  it('resolves and reopens rows', async () => {
    db.appFeedback.updateMany.mockResolvedValue({ count: 2 });
    expect(await service.setResolved(['a', 'b'], true, 'admin@example.com')).toEqual({ count: 2 });
    expect(db.appFeedback.updateMany).toHaveBeenLastCalledWith({ where: { id: { in: ['a', 'b'] } }, data: { resolvedAt: expect.any(Date), resolvedBy: 'admin@example.com' } });
    await service.setResolved(['a'], false, 'admin@example.com');
    expect(db.appFeedback.updateMany.mock.calls[1][0].data).toEqual({ resolvedAt: null, resolvedBy: null });
  });

  it('aggregates pages across ratings, then sorts bad share and response count', async () => {
    db.appFeedback.groupBy.mockResolvedValue([
      { route: '/a', platform: 'web', rating: 1, _count: { _all: 1, message: 1 } },
      { route: '/a', platform: 'web', rating: 3, _count: { _all: 3, message: 1 } },
      { route: '/b', platform: 'web', rating: 1, _count: { _all: 2, message: 1 } },
      { route: '/b', platform: 'web', rating: 2, _count: { _all: 2, message: 0 } },
      { route: '/c', platform: 'web', rating: 1, _count: { _all: 1, message: 0 } },
      { route: '/c', platform: 'web', rating: 3, _count: { _all: 1, message: 0 } },
    ]);
    expect(await service.pages({ platform: 'web', days: 7 })).toEqual([
      { route: '/b', platform: 'web', responses: 4, bad: 2, ok: 2, good: 0, comments: 1 },
      { route: '/c', platform: 'web', responses: 2, bad: 1, ok: 0, good: 1, comments: 0 },
      { route: '/a', platform: 'web', responses: 4, bad: 1, ok: 0, good: 3, comments: 2 },
    ]);
    expect(db.appFeedback.groupBy.mock.calls[0][0].where).toMatchObject({ kind: 'RATING', route: { not: null }, platform: 'web', createdAt: { gte: expect.any(Date) } });
  });

  it('returns only the latest 20 page comments with public user names', async () => {
    db.appFeedback.findMany.mockResolvedValue([{ id: 'fb1', rating: 1, message: 'ติด', createdAt: new Date(0), user: { id: 'u1', firstName: 'A', lastName: 'B' }, firm: null }]);
    expect(await service.pageComments({ route: '/cases/[id]', platform: 'ios' })).toEqual([{ id: 'fb1', rating: 1, message: 'ติด', createdAt: new Date(0), user: { id: 'u1', name: 'A B' }, firm: null }]);
    expect(db.appFeedback.findMany.mock.calls[0][0]).toMatchObject({ take: 20, where: { route: '/cases/[id]', platform: 'ios', kind: 'RATING', message: { not: null, notIn: [''] } } });
  });

  it('surveys LINE-linked Users whose oldest membership is staff (what the bot acts as); counts their firms', async () => {
    db.user.findMany.mockResolvedValue([
      { id: 'u1', lineUserId: 'L1', firmMembers: [{ firmId: 'f1', role: 'LAWYER' }] },
      { id: 'u2', lineUserId: 'L2', firmMembers: [{ firmId: 'f2', role: 'OWNER' }] },
      // Staff elsewhere, but the bot resolves them as their older EXTERNAL membership: they could never answer.
      { id: 'u3', lineUserId: 'L3', firmMembers: [{ firmId: 'f3', role: 'EXTERNAL' }] },
    ]);
    db.appFeedbackLineRound.findMany.mockResolvedValue([{ id: 'r1', sentAt: new Date(0), recipientCount: 2 }]);
    db.appFeedback.groupBy.mockResolvedValue([{ lineRoundId: 'r1', rating: 1, _count: { _all: 1, message: 1 } }, { lineRoundId: 'r1', rating: 3, _count: { _all: 1, message: 0 } }]);
    expect(await service.lineRounds()).toEqual({ recipients: { users: 2, firms: 2 }, lastSentAt: new Date(0), rounds: [{ id: 'r1', sentAt: new Date(0), recipientCount: 2, answered: 2, bad: 1, ok: 0, good: 1, comments: 1 }] });
    expect(db.user.findMany.mock.calls[0][0]).toMatchObject({ where: { lineUserId: { not: null }, firmMembers: { some: { role: { not: 'EXTERNAL' } } } }, select: { firmMembers: { orderBy: { createdAt: 'asc' }, take: 1 } } });
  });

  it('pushes sequentially, counts boolean successes and continues after thrown/false deliveries', async () => {
    db.user.findMany.mockResolvedValue(['L1', 'L2', 'L3', 'L4'].map((lineUserId, index) => ({ id: `u${index}`, lineUserId, firmMembers: [] })));
    line.pushTo.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    expect(await service.sendLineRound('admin')).toEqual({ id: 'round1', recipientCount: 4, delivered: 2 });
    expect(db.appFeedbackLineRound.create).toHaveBeenCalledWith({ data: { sentById: 'admin', recipientCount: 4 } });
    expect(line.pushTo).toHaveBeenCalledTimes(4);
    expect(line.pushTo.mock.calls[0]).toEqual(['L1', 'การใช้งาน Samnuan ช่วงนี้เป็นยังไงบ้างครับ?', [
      { label: '😞 ใช้ยาก', text: '😞 ใช้ยาก', data: 'fbk:round1:1' },
      { label: '😐 พอใช้', text: '😐 พอใช้', data: 'fbk:round1:2' },
      { label: '😊 ใช้ง่าย', text: '😊 ใช้ง่าย', data: 'fbk:round1:3' },
    ]]);
  });

  it('upserts the second tap on round/user without erasing a comment', async () => {
    db.appFeedback.upsert.mockResolvedValue({ id: 'fb1' });
    expect(await service.lineRating(user, 'round1', 1)).toEqual({ id: 'fb1' });
    await service.lineRating(user, 'round1', 3);
    expect(db.appFeedback.upsert.mock.calls[1][0]).toEqual({ where: { lineRoundId_userId: { lineRoundId: 'round1', userId: 'u1' } }, create: { kind: 'RATING', source: 'LINE', rating: 3, lineRoundId: 'round1', userId: 'u1', firmId: 'f1' }, update: { rating: 3 }, select: { id: true } });
  });

  it('ignores an unknown round without creating any answer', async () => {
    db.appFeedbackLineRound.findUnique.mockResolvedValue(null);
    expect(await service.lineRating(user, 'unknown', 1)).toBeNull();
    expect(db.appFeedback.upsert).not.toHaveBeenCalled();
  });

  it('saves LINE details only on that user’s LINE rating, clipped to 500', async () => {
    await service.lineDetail('fb1', 'u1', 'ก'.repeat(501));
    expect(db.appFeedback.updateMany).toHaveBeenCalledWith({ where: { id: 'fb1', userId: 'u1', source: 'LINE', kind: 'RATING' }, data: { message: 'ก'.repeat(500) } });
  });

  it('returns screenshot metadata only for an existing screenshot', async () => {
    db.appFeedback.findUnique.mockResolvedValue(null);
    await expect(service.screenshot('missing')).rejects.toThrow(NotFoundException);
    db.appFeedback.findUnique.mockResolvedValue({ screenshotPath: null });
    await expect(service.screenshot('fb1')).rejects.toThrow(NotFoundException);
    db.appFeedback.findUnique.mockResolvedValue({ screenshotPath: 'path', screenshotMime: 'image/png' });
    expect(await service.screenshot('fb1')).toEqual({ screenshotPath: 'path', screenshotMime: 'image/png' });
  });
});

describe('feedback request DTOs', () => {
  it('parses multipart rating, accepts metadata for clipping, and rejects null fields', async () => {
    const dto = plainToInstance(CreateAppFeedbackDto, { kind: 'RATING', rating: '2', platform: 'web', route: 'x'.repeat(400), appVersion: 'v'.repeat(80) });
    expect(dto.rating).toBe(2);
    expect(await validate(dto)).toHaveLength(0);
    expect((await validate(plainToInstance(CreateAppFeedbackDto, { kind: 'RATING', rating: true, platform: 'web' }))).length).toBeGreaterThan(0);
    for (const field of ['message', 'rating', 'route', 'appVersion']) {
      expect((await validate(plainToInstance(CreateAppFeedbackDto, { ...input, [field]: null }))).length).toBeGreaterThan(0);
    }
  });

  it('rejects invalid query windows and unsafe bulk resolve bodies', async () => {
    expect((await validate(plainToInstance(FeedbackPagesQueryDto, { days: -1 }))).length).toBeGreaterThan(0);
    expect((await validate(plainToInstance(ResolveFeedbackDto, { ids: [], resolved: 'true' }))).length).toBeGreaterThan(0);
  });
});
