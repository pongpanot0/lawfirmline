import { FirmLinkService } from './firm-link.service';

const prisma = { firm: { findUnique: jest.fn() } } as any;
const configOf = (vars: Record<string, string | undefined>) =>
  ({ get: (key: string) => vars[key] }) as any;

describe('FirmLinkService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.firm.findUnique.mockResolvedValue({ slug: 'thesiambarristers' });
  });

  // The whole reason this service exists: the app reads the tenant from the
  // subdomain, so a link to the bare root domain opens a page with no firm.
  it('puts the firm slug on the deployed origin', async () => {
    const svc = new FirmLinkService(
      prisma,
      configOf({ APP_URL: 'https://samnuan.com', ROOT_DOMAIN: 'samnuan.com' }),
    );

    await expect(svc.linkFor('f1', '/cases/c1')).resolves.toBe(
      'https://thesiambarristers.samnuan.com/cases/c1',
    );
  });

  it('keeps the port on localhost so dev links still open', async () => {
    const svc = new FirmLinkService(prisma, configOf({ WEB_APP_URL: 'http://localhost:3000' }));

    await expect(svc.linkFor('f1', '/todos')).resolves.toBe(
      'http://thesiambarristers.localhost:3000/todos',
    );
  });

  it('falls back to the root origin rather than throwing on an unknown firm', async () => {
    prisma.firm.findUnique.mockResolvedValue(null);
    const svc = new FirmLinkService(prisma, configOf({ APP_URL: 'https://samnuan.com' }));

    await expect(svc.linkFor('gone', '/todos')).resolves.toBe('https://samnuan.com/todos');
  });

  it('survives a malformed APP_URL', async () => {
    const svc = new FirmLinkService(prisma, configOf({ APP_URL: 'not a url' }));

    expect(svc.rootOrigin()).toBe('http://localhost:3000');
  });
});
