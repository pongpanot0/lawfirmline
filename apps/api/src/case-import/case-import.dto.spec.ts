import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateExcelCasesDto } from './case-import.dto';

const lead = '00000000-0000-4000-8000-000000000001';
const ok = { rowNumber: 2, title: 'คดี A', leadLawyerId: lead, buddyIds: [], courtLevel: 'TRIAL', opponents: [], closed: false };
const errorsFor = (rows: unknown[]) => validate(plainToInstance(CreateExcelCasesDto, { rows }));

describe('CreateExcelCasesDto', () => {
  it('accepts an open row and a complete closed row', async () => {
    expect(await errorsFor([ok, { ...ok, rowNumber: 3, closed: true, outcome: 'WON', closingSummary: 'ชนะคดีเรียบร้อยแล้ว', closedAt: '2025-09-30', stage: 'HEARING', openedAt: '2025-01-02' }])).toHaveLength(0);
  });

  it.each([
    ['closed without outcome', { closed: true, closingSummary: 'สรุปยาวพอแล้วครับ' }],
    ['closed as IN_PROGRESS', { closed: true, outcome: 'IN_PROGRESS', closingSummary: 'สรุปยาวพอแล้วครับ' }],
    ['a short closing summary', { closed: true, outcome: 'WON', closingSummary: 'สั้น' }],
    ['stage CLOSING', { stage: 'CLOSING' }],
    ['a bad black number', { blackCaseNumber: '264.69' }],
    ['a negative amount', { claimedAmount: -1 }],
    ['a non-date', { openedAt: '15/02/2569' }],
    ['a non-uuid lead', { leadLawyerId: 'anan@firm.co' }],
    ['an empty title', { title: '   ' }],
  ])('rejects %s', async (_label, extra) => {
    expect((await errorsFor([{ ...ok, ...extra }])).length).toBeGreaterThan(0);
  });

  it('rejects an empty or oversized batch', async () => {
    expect((await errorsFor([])).length).toBeGreaterThan(0);
    expect((await errorsFor(Array.from({ length: 301 }, (_, i) => ({ ...ok, rowNumber: i + 2 })))).length).toBeGreaterThan(0);
  });
});
