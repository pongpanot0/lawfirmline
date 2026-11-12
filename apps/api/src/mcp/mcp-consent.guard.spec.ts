import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { McpConsentGuard } from './mcp-consent.guard';

describe('MCP consent session guard', () => {
  afterEach(() => jest.restoreAllMocks());

  function build(payload: unknown) {
    const jwt = { decode: jest.fn().mockReturnValue(payload) };
    const req = { headers: { authorization: 'Bearer signed-access-token' }, mcpSessionJti: undefined };
    const context = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    const guard = new McpConsentGuard(new Reflector(), jwt as unknown as JwtService);
    return { jwt, req, context, guard };
  }

  it('rejects a legacy access JWT lacking session identity with a sign-in prompt', async () => {
    jest.spyOn(JwtAuthGuard.prototype, 'canActivate').mockResolvedValue(true);
    const { guard, context } = build({ sub: 'user' });
    await expect(guard.canActivate(context)).rejects.toThrow('กรุณาเข้าสู่ระบบอีกครั้งก่อนเชื่อมต่อ AI');
  });

  it('attaches only the signed session identity after the normal guard accepts the token', async () => {
    const authenticated = jest.spyOn(JwtAuthGuard.prototype, 'canActivate').mockResolvedValue(true);
    const { jwt, req, context, guard } = build({ jti: 'session' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.mcpSessionJti).toBe('session');
    expect(jwt.decode).toHaveBeenCalledWith('signed-access-token');
    expect(authenticated.mock.invocationCallOrder[0]).toBeLessThan(jwt.decode.mock.invocationCallOrder[0]);
  });

  it('never decodes an unverified token', async () => {
    jest.spyOn(JwtAuthGuard.prototype, 'canActivate').mockRejectedValue(new UnauthorizedException());
    const { jwt, context, guard } = build({ jti: 'attacker' });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(jwt.decode).not.toHaveBeenCalled();
  });
});
