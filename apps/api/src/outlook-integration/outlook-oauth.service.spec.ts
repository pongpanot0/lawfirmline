import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutlookOAuthService } from './outlook-oauth.service';

describe('OutlookOAuthService state signing', () => {
  let service: OutlookOAuthService;
  const mockConfig = { get: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockImplementation((key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      return undefined;
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [OutlookOAuthService, { provide: ConfigService, useValue: mockConfig }],
    }).compile();
    service = module.get(OutlookOAuthService);
  });

  it('signs and verifies a state round-trip', () => {
    const state = service.signState('firm-1', 'user-1');
    const decoded = service.verifyState(state);
    expect(decoded.firmId).toBe('firm-1');
    expect(decoded.userId).toBe('user-1');
  });

  it('rejects a tampered state (signature mismatch)', () => {
    const state = service.signState('firm-1', 'user-1');
    const [json] = state.split('.');
    const tampered = `${json}.wrongsignature000000000000000000000000000000000000000000000000`;
    expect(() => service.verifyState(tampered)).toThrow(BadRequestException);
  });

  it('rejects a state signed with a different secret', () => {
    const state = service.signState('firm-1', 'user-1');
    mockConfig.get.mockImplementation((key: string) => (key === 'JWT_SECRET' ? 'different-secret' : undefined));
    expect(() => service.verifyState(state)).toThrow(BadRequestException);
  });

  it('rejects a malformed state', () => {
    expect(() => service.verifyState('not-a-valid-state')).toThrow(BadRequestException);
  });

  it('rejects an expired state', () => {
    const realNow = Date.now;
    const state = service.signState('firm-1', 'user-1');
    Date.now = () => realNow() + 11 * 60_000;
    expect(() => service.verifyState(state)).toThrow(/หมดอายุ/);
    Date.now = realNow;
  });

  it('buildAuthorizationUrl throws a clear error when MS_CLIENT_ID is not configured', () => {
    expect(() => service.buildAuthorizationUrl('some-state')).toThrow(/MS_CLIENT_ID/);
  });

  it('buildAuthorizationUrl includes the required delegated scopes when configured', () => {
    mockConfig.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        JWT_SECRET: 'test-secret',
        MS_CLIENT_ID: 'client-123',
        MS_TENANT_ID: 'common',
        API_PUBLIC_URL: 'https://api.example.com',
      };
      return values[key];
    });
    const url = new URL(service.buildAuthorizationUrl('state-abc'));
    expect(url.hostname).toBe('login.microsoftonline.com');
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.example.com/outlook/callback');
    expect(url.searchParams.get('scope')).toContain('offline_access');
    expect(url.searchParams.get('scope')).toContain('Mail.ReadWrite.Shared');
    expect(url.searchParams.get('state')).toBe('state-abc');
  });
});
