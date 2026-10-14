import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FirmLinkService } from '../notifications/firm-link.service';
import { OutlookOAuthController } from './outlook-oauth.controller';
import { OutlookOAuthService } from './outlook-oauth.service';
import { OutlookGraphClient } from './outlook-graph.client';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookSubscriptionService } from './outlook-subscription.service';

describe('OutlookOAuthController browser binding', () => {
  let controller: OutlookOAuthController;
  const oauth = { signState: jest.fn(), verifyState: jest.fn(), buildAuthorizationUrl: jest.fn(), exchangeCodeForTokens: jest.fn() };
  const graph = { getMailboxAddress: jest.fn() };
  const connections = { upsertFromOAuth: jest.fn() };
  const subscriptions = { ensureSubscription: jest.fn() };
  const firmLink = { rootOrigin: jest.fn(), originForFirm: jest.fn() };
  const res = { cookie: jest.fn(), clearCookie: jest.fn(), redirect: jest.fn() };
  const reqWith = (cookie?: string, secure = true) => ({ secure, headers: cookie ? { cookie } : {} }) as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    firmLink.rootOrigin.mockReturnValue('https://root.test');
    firmLink.originForFirm.mockResolvedValue('https://firm.test');
    oauth.buildAuthorizationUrl.mockImplementation((s: string) => `https://login.test/authorize?state=${s}`);
    oauth.signState.mockImplementation((f: string, u: string, n: string) => `state:${f}:${u}:${n}`);
    oauth.exchangeCodeForTokens.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3600 });
    graph.getMailboxAddress.mockResolvedValue('a@b.test');
    connections.upsertFromOAuth.mockResolvedValue({ id: 'conn-1' });
    const module = await Test.createTestingModule({
      controllers: [OutlookOAuthController],
      providers: [
        { provide: OutlookOAuthService, useValue: oauth },
        { provide: OutlookGraphClient, useValue: graph },
        { provide: OutlookConnectionsService, useValue: connections },
        { provide: OutlookSubscriptionService, useValue: subscriptions },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: FirmLinkService, useValue: firmLink },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(OutlookOAuthController);
  });

  const cb = (state: string, req: any, errorDescription?: string) =>
    controller.callback('code-1', state, errorDescription as string, req, res as any);

  it('connect sets the nonce cookie with exact flags and binds the same nonce into the state', () => {
    const out = controller.connect({ firmId: 'firm-1', id: 'user-1' } as any, reqWith(undefined, true), res as any);
    const [name, nonce, opts] = res.cookie.mock.calls[0];
    expect(name).toBe('m365_oauth_nonce');
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(opts).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/outlook', maxAge: 600_000 });
    expect(oauth.signState).toHaveBeenCalledWith('firm-1', 'user-1', nonce);
    expect(out.url).toBe(`https://login.test/authorize?state=state:firm-1:user-1:${nonce}`);
  });

  it.each([
    ['no cookie', undefined],
    ['mismatched cookie', 'm365_oauth_nonce=other'],
  ])('callback with %s redirects to error and never exchanges the code', async (_n, cookie) => {
    oauth.verifyState.mockReturnValue({ firmId: 'firm-1', userId: 'user-1', nonce: 'n1' });
    await cb('s', reqWith(cookie));
    expect(oauth.exchangeCodeForTokens).not.toHaveBeenCalled();
    expect(connections.upsertFromOAuth).not.toHaveBeenCalled();
    expect(res.redirect.mock.calls[0][0]).toContain('/settings?outlook=error');
    expect(res.clearCookie).toHaveBeenCalledWith('m365_oauth_nonce', { path: '/outlook' });
  });

  it('callback with matching cookie exchanges, upserts for the state firm/user and redirects connected', async () => {
    oauth.verifyState.mockReturnValue({ firmId: 'firm-1', userId: 'user-1', nonce: 'n1' });
    await cb('s', reqWith('a=b; m365_oauth_nonce=n1'));
    expect(oauth.exchangeCodeForTokens).toHaveBeenCalledWith('code-1');
    expect(connections.upsertFromOAuth).toHaveBeenCalledWith(
      { firmId: 'firm-1', id: 'user-1' },
      expect.objectContaining({ accessToken: 'at' }),
      'a@b.test',
    );
    expect(res.redirect.mock.calls[0][0]).toBe('https://firm.test/settings?outlook=connected');
    expect(res.clearCookie).toHaveBeenCalledWith('m365_oauth_nonce', { path: '/outlook' });
  });

  it('callback clears the cookie on the error_description path and on an invalid state', async () => {
    await cb('s', reqWith('m365_oauth_nonce=n1'), 'access_denied');
    expect(res.clearCookie).toHaveBeenCalledTimes(1);
    oauth.verifyState.mockImplementation(() => {
      throw new BadRequestException('state ไม่ถูกต้อง');
    });
    await cb('bad', reqWith('m365_oauth_nonce=n1'));
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
    expect(res.redirect.mock.calls[1][0]).toContain('outlook=error');
  });
});
