import { Controller, Get, INestApplication, MiddlewareConsumer, Module, NestModule, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { FirmRole } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtStrategy } from '../auth/jwt.strategy';
import { TenantService } from './tenant.service';
import { TenantResolveMiddleware } from './middleware/tenant-resolve.middleware';

/**
 * Real HTTP pipeline (middleware → controller guard → passport strategy): a
 * firm-A token on firm B's subdomain is refused, apex and own-firm pass.
 */
@Controller('probe')
@UseGuards(JwtAuthGuard)
class ProbeController {
  @Get()
  ok() {
    return { ok: true };
  }
}

const firms: Record<string, string> = { 'firm-a': 'A', 'firm-b': 'B' };
const tenant = {
  findBySlug: async (slug: string) => (firms[slug] ? { id: firms[slug] } : null),
  buildAuthUser: async (sub: string, firmId: string) => ({ id: sub, firmId, firmRole: FirmRole.LAWYER }),
};

@Module({
  controllers: [ProbeController],
  providers: [
    JwtStrategy,
    TenantResolveMiddleware,
    { provide: TenantService, useValue: tenant },
    { provide: ConfigService, useValue: { get: () => undefined } },
  ],
})
class ProbeModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantResolveMiddleware).forRoutes('*');
  }
}

describe('tenant match over HTTP', () => {
  let app: INestApplication;
  let base: string;
  const token = new JwtService({ secret: 'dev-secret' }).sign({ sub: 'u1', firmId: 'A', firmRole: FirmRole.LAWYER });
  const get = (headers: Record<string, string> = {}) =>
    fetch(`${base}/probe`, { headers: { Authorization: `Bearer ${token}`, ...headers } }).then((r) => r.status);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(() => app.close());

  it("refuses a firm-A user on firm B's subdomain", async () => {
    expect(await get({ 'x-firm-slug': 'firm-b' })).toBe(403);
  });

  it("lets a firm-A user through on firm A's subdomain", async () => {
    expect(await get({ 'x-firm-slug': 'firm-a' })).toBe(200);
  });

  it('leaves apex requests unrestricted', async () => {
    expect(await get()).toBe(200);
  });

  it('still answers 401 without a token, whatever the subdomain', async () => {
    expect(await fetch(`${base}/probe`, { headers: { 'x-firm-slug': 'firm-b' } }).then((r) => r.status)).toBe(401);
  });
});
