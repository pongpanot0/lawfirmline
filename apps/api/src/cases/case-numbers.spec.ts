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

  it('still rejects a number that does not fit the court format', async () => {
    const dto = Object.assign(new CreateCaseDto(), base, { blackCaseNumber: 'abc' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'blackCaseNumber')).toBe(true);
  });
});
