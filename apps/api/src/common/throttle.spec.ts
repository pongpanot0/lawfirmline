import { Controller, INestApplication, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthThrottle } from './throttle';

@Controller('t')
class Probe {
  @Post('login')
  @AuthThrottle()
  login() { return { ok: true }; }

  @Post('other')
  other() { return { ok: true }; }
}

describe('auth throttling', () => {
  let app: INestApplication;
  let base: string;
  const post = (path: string) => fetch(`${base}${path}`, { method: 'POST' }).then((res) => res.status);
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 600 }])],
      controllers: [Probe],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = mod.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(() => app.close());

  it('lets a person retry but stops guessing on the 11th attempt in a minute', async () => {
    for (let i = 0; i < 10; i++) expect(await post('/t/login')).toBe(201);
    expect(await post('/t/login')).toBe(429);
  });

  it('ordinary routes keep the generous default', async () => {
    for (let i = 0; i < 20; i++) expect(await post('/t/other')).toBe(201);
  });
});
