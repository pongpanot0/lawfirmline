import { Controller, Get, INestApplication, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import Stripe from 'stripe';
import { FirmRole, SubscriptionStatus } from '@lawfirm/shared';
import { JwtStrategy } from '../auth/jwt.strategy';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.module';
import { EmailService } from '../notifications/email.service';
import { InvitationService } from './invitation.service';
import { SaasController } from './saas.controller';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';
import { TenantService } from './tenant.service';

/**
 * Real Nest HTTP pipeline (rawBody, passport JWT, JwtAuthGuard, FirmRoleGuard,
 * SaasController) with Prisma and Stripe's network calls stubbed.
 */
const JWT_SECRET = 'test-jwt';
const WEBHOOK_SECRET = 'whsec_http_test';
const env: Record<string, string> = { JWT_SECRET, STRIPE_SECRET_KEY: 'sk_test_http', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET };

@Controller('probe')
@UseGuards(JwtAuthGuard)
class Probe {
  @Get() read() { return { ok: true }; }
  @Post() write() { return { ok: true }; }
}

describe('billing over HTTP', () => {
  let app: INestApplication;
  let base: string;
  let status = SubscriptionStatus.EXPIRED;
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const stripe = new StripeService(config);
  const jwt = new JwtService({ secret: JWT_SECRET });
  const token = jwt.sign({ sub: 'u1', email: 'owner@firm.test', firmId: 'firm-1', firmRole: FirmRole.OWNER });

  const tenant = {
    buildAuthUser: jest.fn(async () => ({ id: 'u1', email: 'owner@firm.test', firmId: 'firm-1', firmRole: FirmRole.OWNER, subscriptionStatus: status })),
    isOwner: () => true,
  };
  const tx = { firm: { update: jest.fn() }, subscription: { upsert: jest.fn() }, auditLog: { create: jest.fn() } };
  const prisma = {
    firm: {
      findUnique: jest.fn(async () => ({ id: 'firm-1', name: 'Firm One', stripeCustomerId: null, stripeSubscriptionId: null, subscriptionStatus: status })),
      findFirst: jest.fn(async () => ({ id: 'firm-1', subscriptionStatus: status, subscriptionPlan: null })),
      update: jest.fn(),
    },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  };
  const createCustomer = jest.spyOn(stripe.client.customers, 'create').mockResolvedValue({ id: 'cus_1' } as any);
  const createSession = jest.spyOn(stripe.client.checkout.sessions, 'create').mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' } as any);
  const retrieve = jest.spyOn(stripe.client.subscriptions, 'retrieve').mockResolvedValue({
    id: 'sub_1', status: 'active', customer: 'cus_1', canceled_at: null,
    metadata: { firmId: 'firm-1', plan: 'FIRM', billingPeriod: 'MONTHLY' },
    items: { data: [{ current_period_start: 1_700_000_000, current_period_end: 1_702_592_000 }] },
  } as any);

  const call = (path: string, init: RequestInit = {}) =>
    fetch(`${base}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [SaasController, Probe],
      providers: [
        JwtStrategy,
        SubscriptionService,
        { provide: StripeService, useValue: stripe },
        { provide: ConfigService, useValue: config },
        { provide: TenantService, useValue: tenant },
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: { getAppUrl: () => 'https://app.samnuan.test' } },
        { provide: InvitationService, useValue: {} },
        { provide: AuthService, useValue: {} },
      ],
    }).compile();
    app = mod.createNestApplication({ rawBody: true });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })); // same as main.ts
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
    [createCustomer, createSession, retrieve].forEach((s) => s.mockRestore());
  });
  beforeEach(() => { status = SubscriptionStatus.EXPIRED; jest.clearAllMocks(); });

  it('expired firm: reads pass, writes get 402 SUBSCRIPTION_INACTIVE', async () => {
    expect((await call('/probe')).status).toBe(200);
    const res = await call('/probe', { method: 'POST' });
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: 'SUBSCRIPTION_INACTIVE' });
  });

  it('active firm writes normally', async () => {
    status = SubscriptionStatus.ACTIVE;
    expect((await call('/probe', { method: 'POST' })).status).toBe(201);
  });

  it('expired owner can still start Stripe Checkout (route is @SkipSubscription)', async () => {
    const res = await call('/saas/billing/checkout', { method: 'POST', body: JSON.stringify({ plan: 'FIRM', billingPeriod: 'YEARLY' }) });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    expect(createCustomer).toHaveBeenCalledWith({ name: 'Firm One', email: 'owner@firm.test', metadata: { firmId: 'firm-1' } });
    const params = createSession.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams;
    expect(params).toMatchObject({
      mode: 'subscription',
      customer: 'cus_1',
      client_reference_id: 'firm-1',
      subscription_data: { metadata: { firmId: 'firm-1', plan: 'FIRM', billingPeriod: 'YEARLY' } },
      success_url: 'https://app.samnuan.test/account/billing?success=1',
    });
    expect(params.line_items![0].price_data).toMatchObject({ currency: 'thb', recurring: { interval: 'year' } });
    expect(params.line_items![0].price_data!.unit_amount).toBeGreaterThan(0);
  });

  it('PromptPay checkout is a one-time payment (no subscription)', async () => {
    const res = await call('/saas/billing/checkout', { method: 'POST', body: JSON.stringify({ plan: 'SOLO', billingPeriod: 'MONTHLY', paymentMethod: 'promptpay' }) });
    expect(res.status).toBe(201);
    const params = createSession.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams;
    expect(params).toMatchObject({ mode: 'payment', payment_method_types: ['promptpay'], client_reference_id: 'firm-1', metadata: { plan: 'SOLO', billingPeriod: 'MONTHLY' } });
    expect(params.line_items![0].price_data).toMatchObject({ currency: 'thb', unit_amount: 990 * 100 });
    expect(params.line_items![0].price_data!.recurring).toBeUndefined();
    expect(params.subscription_data).toBeUndefined();
  });

  it('rejects an unknown payment method', async () => {
    const res = await call('/saas/billing/checkout', { method: 'POST', body: JSON.stringify({ plan: 'SOLO', paymentMethod: 'bitcoin' }) });
    expect(res.status).toBe(400);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('rejects an unknown plan before touching Stripe', async () => {
    const res = await call('/saas/billing/checkout', { method: 'POST', body: JSON.stringify({ plan: 'FREE' }) });
    expect(res.status).toBe(400);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('webhook: a correctly signed raw body is accepted and syncs the firm', async () => {
    const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_1' } } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const res = await fetch(`${base}/saas/webhooks/stripe`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ received: true });
    expect(retrieve).toHaveBeenCalledWith('sub_1');
    expect(tx.firm.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ subscriptionStatus: SubscriptionStatus.ACTIVE, subscriptionPlan: 'FIRM' }) }));
  });

  it('webhook: a tampered body fails the signature check with 400', async () => {
    const payload = JSON.stringify({ id: 'evt_2', type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_1' } } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const res = await fetch(`${base}/saas/webhooks/stripe`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload.replace('sub_1', 'sub_x') });
    expect(res.status).toBe(400);
    expect(retrieve).not.toHaveBeenCalled();
  });
});
