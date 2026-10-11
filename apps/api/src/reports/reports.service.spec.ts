import { FirmRole } from '@lawfirm/shared';
import { ReportsService } from './reports.service';

describe('ReportsService.getSummary scope', () => {
  const prisma = {
    case: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
    calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
    expense: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
  const caseAccess = { getCaseFilterForFinancials: jest.fn().mockReturnValue({}) } as any;
  const svc = new ReportsService(prisma, caseAccess);
  const user = (firmRole: FirmRole) => ({ id: 'u', firmId: 'f', firmName: 'F', firmRole }) as any;

  it.each([[FirmRole.OWNER, 'firm'], [FirmRole.OFFICE_MANAGER, 'firm'], [FirmRole.LAWYER, 'user']])('%s -> %s', async (role, scope) => {
    expect((await svc.getSummary(user(role))).scope).toBe(scope);
  });
});
