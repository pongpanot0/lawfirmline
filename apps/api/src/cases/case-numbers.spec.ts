import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCaseDto } from './dto/case.dto';
import { CourtLevel } from '@lawfirm/shared';

const base = {
  title: 'test',
  courtLevel: CourtLevel.TRIAL,
  leadLawyerId: '00000000-0000-4000-8000-000000000001',
};

describe('case numbers on creation', () => {
  it('accepts a case with no black or red number yet', async () => {
    const dto = Object.assign(new CreateCaseDto(), base);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('treats an empty string as "not yet" rather than as a malformed number', async () => {
    // Mirrors the global ValidationPipe (transform: true), which trims first.
    const dto = plainToInstance(CreateCaseDto, {
      ...base,
      blackCaseNumber: '',
      redCaseNumber: '  ',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  // Courts prefix the running number with a case-type code in Thai letters;
  // the digits-only rule made those numbers impossible to enter.
  it.each(['กก1123/2567', 'ผบ.1234/2567', 'อ 123/2567', 'พ1/2567', '123/2567'])(
    'accepts %s',
    async (blackCaseNumber) => {
      const dto = Object.assign(new CreateCaseDto(), base, { blackCaseNumber });
      expect(await validate(dto)).toHaveLength(0);
    },
  );

  it.each(['abc123/2567', 'กก1123/123', 'กกกกกกก123/2567', '1234567/2567'])(
    'rejects %s',
    async (blackCaseNumber) => {
      const dto = Object.assign(new CreateCaseDto(), base, { blackCaseNumber });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'blackCaseNumber')).toBe(true);
    },
  );

  it('still rejects a number that does not fit the court format', async () => {
    const dto = Object.assign(new CreateCaseDto(), base, { blackCaseNumber: 'abc' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'blackCaseNumber')).toBe(true);
  });
});
