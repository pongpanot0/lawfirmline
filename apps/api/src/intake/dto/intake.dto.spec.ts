import { IntakeStatus, IntakeDecision, CreateIntakeDto } from './intake.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

describe('intake.dto enum additions', () => {
  it('includes CONSULTED in IntakeStatus', () => {
    expect(IntakeStatus.CONSULTED).toBe('CONSULTED');
  });

  it('includes CONSULTATION_ONLY in IntakeDecision', () => {
    expect(IntakeDecision.CONSULTATION_ONLY).toBe('CONSULTATION_ONLY');
  });

  it('accepts relatedCaseId, isOngoingElsewhere, externalCaseNumber, currentStageNote on CreateIntakeDto', async () => {
    const dto = plainToInstance(CreateIntakeDto, {
      receivedDate: '2026-09-06',
      relatedCaseId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      isOngoingElsewhere: true,
      externalCaseNumber: 'ดำที่ 123/2569',
      currentStageNote: 'นัดสืบพยาน 15 ต.ค.',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-UUID relatedCaseId on CreateIntakeDto', async () => {
    const dto = plainToInstance(CreateIntakeDto, {
      receivedDate: '2026-09-06',
      relatedCaseId: 'not-a-uuid',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'relatedCaseId')).toBe(true);
  });
});
