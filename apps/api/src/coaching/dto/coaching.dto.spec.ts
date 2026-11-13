import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AcknowledgeCoachingDto, CoachingDraftDto, CoachingQueryDto, SaveCoachingDto, StandupDto, StandupHistoryDto } from './coaching.dto';
const id = '11111111-1111-4111-8111-111111111111';
describe('Coaching DTO boundaries', () => {
  it('accepts a valid standup', async () => expect(await validate(plainToInstance(StandupDto, { yesterdayTaskIds: [], todayTaskIds: [id], blocker: 'รอ' }))).toEqual([]));
  it.each(['yesterdayNote', 'todayNote', 'blocker'])('limits %s to 2000 characters', async (field) => {
    expect(await validate(plainToInstance(StandupDto, { yesterdayTaskIds: [], todayTaskIds: [], [field]: 'a'.repeat(2001) }))).not.toEqual([]);
  });
  it.each(['yesterdayTaskIds', 'todayTaskIds'])('bounds and validates %s', async (field) => {
    for (const value of [Array(21).fill(id), ['not-uuid'], [id, id]]) {
      expect(await validate(plainToInstance(StandupDto, { yesterdayTaskIds: [], todayTaskIds: [], [field]: value }))).not.toEqual([]);
    }
  });
  it.each(['praise', 'improve', 'nextStep'])('requires nonblank %s, at most 4000 characters', async (field) => {
    for (const value of [' ', 'a'.repeat(4001)]) expect(await validate(plainToInstance(SaveCoachingDto, { userId: id, praise: 'ชม', improve: 'ปรับ', nextStep: 'ทำ', linkedTaskIds: [], aiDrafted: false, [field]: value }))).not.toEqual([]);
  });
  it('limits reply to 280 and validates linked ids', async () => {
    expect(await validate(plainToInstance(AcknowledgeCoachingDto, { reply: 'a'.repeat(281) }))).not.toEqual([]);
    for (const linkedTaskIds of [Array(21).fill(id), ['bad'], [id, id]]) {
      expect(await validate(plainToInstance(SaveCoachingDto, { userId: id, praise: 'ชม', improve: 'ปรับ', nextStep: 'ทำ', linkedTaskIds, aiDrafted: false }))).not.toEqual([]);
    }
  });
  it('validates member id, status and numeric history days', async () => {
    expect(await validate(plainToInstance(CoachingDraftDto, { userId: 'foreign' }))).not.toEqual([]);
    expect(await validate(plainToInstance(CoachingQueryDto, { status: 'whatever' }))).not.toEqual([]);
    expect(await validate(plainToInstance(StandupHistoryDto, { days: '6' }))).toEqual([]);
    expect(await validate(plainToInstance(StandupHistoryDto, { days: '0' }))).not.toEqual([]);
    expect(await validate(plainToInstance(StandupHistoryDto, { days: '366' }))).not.toEqual([]);
    expect(plainToInstance(StandupHistoryDto, {}).days).toBe(6);
  });
});
