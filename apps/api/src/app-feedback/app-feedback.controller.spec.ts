import { Global, Module, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Readable, Writable } from 'stream';
import { AddressInfo } from 'net';
import type { AuthUser } from '@lawfirm/shared';
import { AppFeedbackController, PlatformFeedbackController } from './app-feedback.controller';
import { AppFeedbackService } from './app-feedback.service';
import { AppFeedbackModule } from './app-feedback.module';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import { ALLOW_EXTERNAL_KEY } from '../common/decorators/allow-external.decorator';
import { SKIP_SUBSCRIPTION_KEY } from '../saas/decorators/saas.decorators';
import { FileStorageService } from '../common/services/file-storage.service';
import { PrismaService } from '../prisma/prisma.module';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { LineBotRouterService } from '../notifications/line-conversation/line-bot-router.service';

// Keep the real global feedback module/LINE-router dependency graph without live providers.
@Global()
@Module({ providers: [{ provide: PrismaService, useValue: {} }, { provide: FileStorageService, useValue: {} }], exports: [PrismaService, FileStorageService] })
class TestInfrastructure {}

const routerDependencies: unknown[] = Reflect.getMetadata('design:paramtypes', LineBotRouterService);
@Module({
  providers: [LineBotRouterService, ...routerDependencies.filter((type) => type !== AppFeedbackService).map((type: any) => ({ provide: type, useValue: {} }))],
  exports: [LineMessagingService, LineBotRouterService],
})
class TestNotifications {}

describe('feedback controllers', () => {
  it('guards platform routes and permits any authenticated member to report despite subscription expiry', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PlatformFeedbackController)).toEqual([JwtAuthGuard, PlatformAdminGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, AppFeedbackController)).toEqual([JwtAuthGuard]);
    expect(Reflect.getMetadata(SKIP_SUBSCRIPTION_KEY, PlatformFeedbackController)).toBe(true);
    expect(Reflect.getMetadata(SKIP_SUBSCRIPTION_KEY, AppFeedbackController)).toBe(true);
    expect(Reflect.getMetadata(ALLOW_EXTERNAL_KEY, AppFeedbackController)).toBe(true);
    expect(Reflect.getMetadata(PATH_METADATA, AppFeedbackController)).toBe('app-feedback');
    expect(Reflect.getMetadata(PATH_METADATA, PlatformFeedbackController)).toBe('platform/feedback');
  });

  it('resolves the real global feedback service in the LINE module with no circular injection', async () => {
    const module = await Test.createTestingModule({ imports: [TestInfrastructure, ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]), AppFeedbackModule] })
      .overrideModule(NotificationsModule).useModule(TestNotifications).compile();
    expect(module.get(LineBotRouterService)).toBeInstanceOf(LineBotRouterService);
    expect(module.get(AppFeedbackService)).toBeInstanceOf(AppFeedbackService);
    await module.close();
  });

  it('streams screenshots with nosniff and a safe type, and handles stream errors', async () => {
    const stream = new Readable({ read() {} });
    const feedback = { screenshot: jest.fn().mockResolvedValue({ screenshotPath: 'key', screenshotMime: 'text/html' }) };
    const storage = { openDownloadStream: jest.fn().mockResolvedValue(stream) };
    const response = Object.assign(new Writable({ write(_chunk, _encoding, done) { done(); } }), { setHeader: jest.fn() });
    const destroy = jest.spyOn(response, 'destroy').mockReturnValue(response);
    await new PlatformFeedbackController(feedback as any, storage as any).screenshot('fb1', response as any);
    expect(response.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
    expect(storage.openDownloadStream).toHaveBeenCalledWith('key');
    const error = new Error('read failed');
    stream.emit('error', error);
    expect(destroy).toHaveBeenCalledWith(error);
    stream.destroy();
  });
});

describe('feedback HTTP boundary and per-user throttle', () => {
  let app: any;
  let origin: string;
  const feedback = { create: jest.fn().mockResolvedValue({ id: 'fb1' }) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }])],
      controllers: [AppFeedbackController],
      providers: [{ provide: AppFeedbackService, useValue: feedback }, { provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => {
      const req = context.switchToHttp().getRequest();
      req.user = { id: req.headers['x-test-user'] ?? 'u1', firmId: 'real-firm' } as AuthUser;
      return true;
    } }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1');
    origin = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterAll(async () => { await app?.close(); });

  async function post(body: object | FormData, userId: string) {
    return fetch(`${origin}/app-feedback`, {
      method: 'POST', headers: { 'x-test-user': userId, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  it('parses multipart fields and takes identity from the guard', async () => {
    const body = new FormData();
    body.append('kind', 'RATING'); body.append('rating', '2'); body.append('platform', 'web');
    const response = await post(body, 'multipart-user');
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'fb1' });
    expect(feedback.create).toHaveBeenCalledWith({ id: 'multipart-user', firmId: 'real-firm' }, expect.objectContaining({ kind: 'RATING', rating: 2 }), undefined);
  });

  it('rejects client-supplied firm/source fields and invalid platform before service', async () => {
    feedback.create.mockClear();
    for (const extra of [{ firmId: 'evil' }, { source: 'LINE' }, { platform: 'line' }]) {
      const response = await post({ kind: 'BUG', message: 'bad', platform: 'web', ...extra }, 'validation-user');
      expect(response.status).toBe(400);
    }
    expect(feedback.create).not.toHaveBeenCalled();
  });

  it('rejects uploads over 10MB and multiple screenshots before service', async () => {
    feedback.create.mockClear();
    const oversized = new FormData();
    oversized.append('kind', 'BUG'); oversized.append('message', 'bad'); oversized.append('platform', 'web');
    oversized.append('screenshot', new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'image/png' }), 'x.png');
    expect((await post(oversized, 'file-user')).status).toBe(413);
    const multiple = new FormData();
    multiple.append('screenshot', new Blob(['x']), 'a.png'); multiple.append('screenshot', new Blob(['x']), 'b.png');
    expect((await post(multiple, 'file-user')).status).toBe(400);
    expect(feedback.create).not.toHaveBeenCalled();
  });

  it('allows ten submissions per user, rejects the eleventh, and does not block another user on the same IP', async () => {
    const body = { kind: 'RATING', rating: 1, platform: 'web' };
    for (let i = 0; i < 10; i++) expect((await post(body, 'limited-user')).status).toBe(201);
    expect((await post(body, 'limited-user')).status).toBe(429);
    expect((await post(body, 'different-user')).status).toBe(201);
  });
});
