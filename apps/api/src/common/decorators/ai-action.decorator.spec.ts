import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { defer, lastValueFrom } from 'rxjs';
import { AiQuotaInterceptor } from './ai-action.decorator';
import { assertFileCredits } from '../ai-credit-context';
import { PlanQuotaService } from '../services/plan-quota.service';

const user = { id: 'u', firmId: 'f' } as any;
const context = { getHandler: () => 'handler', switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;

describe('AI quota interceptor', () => {
  const quota = { assertAiAvailable: jest.fn(), recordAi: jest.fn() };
  const reflector = { get: () => 'analyze' } as unknown as Reflector;
  const interceptor = new AiQuotaInterceptor(reflector, quota as unknown as PlanQuotaService);
  beforeEach(() => {
    jest.clearAllMocks();
    quota.assertAiAvailable.mockResolvedValue(undefined);
    quota.recordAi.mockResolvedValue(undefined);
  });

  it('normal actions keep one credit and await recording before returning', async () => {
    const result = await lastValueFrom(interceptor.intercept(context, { handle: () => defer(async () => 'result') }));
    expect(result).toBe('result');
    expect(quota.assertAiAvailable).toHaveBeenCalledWith(user);
    expect(quota.recordAi).toHaveBeenCalledWith(user, 'analyze', 1);
  });

  it('records the document total once after success; the same file is not charged twice', async () => {
    const scan = Buffer.from('scan');
    const text = Buffer.from('text');
    const result = await lastValueFrom(interceptor.intercept(context, { handle: () => defer(async () => {
      await assertFileCredits([[scan, 3], [text, 1]]);
      await assertFileCredits([[scan, 3]]);
      return 'ok';
    }) }));
    expect(result).toBe('ok');
    expect(quota.recordAi).toHaveBeenCalledTimes(1);
    expect(quota.recordAi).toHaveBeenCalledWith(user, 'analyze', 4);
  });

  it('does not record a failed action', async () => {
    await expect(lastValueFrom(interceptor.intercept(context, { handle: () => defer(async () => { throw new Error('AI failed'); }) }))).rejects.toThrow('AI failed');
    expect(quota.recordAi).not.toHaveBeenCalled();
  });

  it('concurrent requests keep their document costs separate', async () => {
    const request = (credits: number) => lastValueFrom(interceptor.intercept(context, { handle: () => defer(async () => {
      await assertFileCredits([[Buffer.from('scan'), credits]]);
      await Promise.resolve();
      return credits;
    }) }));
    expect(await Promise.all([request(3), request(7)])).toEqual([3, 7]);
    expect(quota.recordAi.mock.calls.map((call) => call[2]).sort()).toEqual([3, 7]);
  });
});
