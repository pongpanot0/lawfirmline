import { BadRequestException } from '@nestjs/common';
import { LegalService } from './legal.service';

describe('LegalService', () => {
  const iapp = { searchPrecedents: jest.fn() };
  const prisma = {
    knowledgeCitation: { findMany: jest.fn() },
    case: { findUnique: jest.fn() },
    legalQuery: { create: jest.fn(), findMany: jest.fn() },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new LegalService(prisma as any, iapp as any);

  beforeEach(() => jest.clearAllMocks());

  it('rejects citation ids that are not in this case', async () => {
    prisma.knowledgeCitation.findMany.mockResolvedValue([{ id: 'c1', statement: 'fact 1' }]);
    await expect(service.ask('u1', 'case1', 'คำถาม', ['c1', 'c-other-case'])).rejects.toThrow(
      BadRequestException,
    );
    expect(iapp.searchPrecedents).not.toHaveBeenCalled();
  });

  it('searches iApp with question + selected fact statements and stores a LEGAL record', async () => {
    prisma.knowledgeCitation.findMany.mockResolvedValue([
      { id: 'c1', statement: 'ผลตรวจเป็นบวก' },
    ]);
    prisma.case.findUnique.mockResolvedValue({ firmId: 'firm1' });
    iapp.searchPrecedents.mockResolvedValue([{ dekaId: '123/2560', headnote: '...', citedStatutes: [], courtLevel: null, judgmentDate: null, sourceUrl: 'x' }]);
    prisma.legalQuery.create.mockImplementation(({ data }) => Promise.resolve(data));

    const result = await service.ask('u1', 'case1', 'มีกฎหมายใดเกี่ยวข้อง', ['c1']);

    expect(iapp.searchPrecedents).toHaveBeenCalledWith(
      expect.stringContaining('ผลตรวจเป็นบวก'),
      { topK: 5 },
    );
    expect(prisma.legalQuery.create).toHaveBeenCalled();
    expect(result).toMatchObject({ caseId: 'case1', firmId: 'firm1', factsText: ['ผลตรวจเป็นบวก'] });
  });
});
