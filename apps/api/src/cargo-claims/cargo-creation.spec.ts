import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CourtLevel } from '@lawfirm/shared';
import { CreateCaseDto } from '../cases/dto/case.dto';
import { CasesService } from '../cases/cases.service';
import { CreateIntakeDto } from '../intake/dto/intake.dto';

describe('cargo claim creation paths', () => {
  it('accepts structured cargo facts on a TRANSPORT intake', async () => {
    const dto = plainToInstance(CreateIntakeDto, {
      receivedDate: '2026-09-22',
      title: 'Cargo loss',
      preLitigationType: 'TRANSPORT',
      cargoClaim: { assuredName: 'ABC', origin: 'Bangkok', destination: 'Tokyo' },
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.cargoClaim?.assuredName).toBe('ABC');
  });

  it('accepts direct Case creation with Cargo workspace enabled', async () => {
    const dto = plainToInstance(CreateCaseDto, {
      title: 'Direct cargo claim',
      courtLevel: CourtLevel.TRIAL,
      leadLawyerId: '11111111-1111-4111-8111-111111111111',
      cargoClaimEnabled: true,
      cargoClaim: { transportDocumentNumber: 'BL-001', claimAmount: 125000 },
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.cargoClaimEnabled).toBe(true);
  });

  it('creates the Cargo profile after a direct Case is saved', async () => {
    const prisma = {
      case: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'case-1', title: 'Cargo' }) },
      caseType: { findFirst: jest.fn() },
      client: { findFirst: jest.fn() },
      firmMember: { count: jest.fn().mockResolvedValue(1) },
    };
    const cargo = { ensureForCase: jest.fn().mockResolvedValue({ id: 'cargo-1' }) };
    const service = new CasesService(
      prisma as never,
      {} as never,
      { log: jest.fn() } as never,
      {} as never,
      { notifyAssigned: jest.fn() } as never,
      cargo as never,
    );

    await service.create({ id: 'user-1', firmId: 'firm-1' } as never, {
      ownRef: 'REF-1',
      title: 'Cargo',
      courtLevel: CourtLevel.TRIAL,
      leadLawyerId: '11111111-1111-4111-8111-111111111111',
      cargoClaimEnabled: true,
      cargoClaim: { assuredName: 'ABC' },
    });

    expect(cargo.ensureForCase).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
      'case-1',
      expect.objectContaining({ assuredName: 'ABC' }),
    );
  });
});
