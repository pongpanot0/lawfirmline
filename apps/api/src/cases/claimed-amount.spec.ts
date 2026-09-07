import 'reflect-metadata';
import { validate } from 'class-validator';
import { CreateCaseDto, UpdateCaseDto } from './dto/case.dto';
import { CourtLevel } from '@lawfirm/shared';

describe('claimed amount', () => {
  it('accepts omitted and zero amount, and rejects invalid money', async () => {
    for (const value of [undefined, 0, 299999.99, 300000]) {
      const dto = Object.assign(new UpdateCaseDto(), { claimedAmount: value });
      expect(await validate(dto)).toHaveLength(0);
    }
    for (const value of [-1, Infinity, 1.001, '1000']) {
      const dto = Object.assign(new UpdateCaseDto(), { claimedAmount: value });
      expect(
        (await validate(dto)).some(
          (error) => error.property === 'claimedAmount',
        ),
      ).toBe(true);
    }
  });
  it('preserves capital separately from estimated fee on creation', async () => {
    const dto = Object.assign(new CreateCaseDto(), {
      title: 'test',
      courtLevel: CourtLevel.TRIAL,
      blackCaseNumber: '1/2569',
      redCaseNumber: '2/2569',
      leadLawyerId: '00000000-0000-4000-8000-000000000001',
      claimedAmount: 200000,
      estimatedFee: 1000,
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.claimedAmount).toBe(200000);
    expect(dto.estimatedFee).toBe(1000);
  });
});
