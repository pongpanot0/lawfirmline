import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/** Holds the one Stripe client. Billing endpoints 503 until STRIPE_SECRET_KEY is set. */
@Injectable()
export class StripeService {
  private readonly stripe: Stripe | null;

  constructor(private config: ConfigService) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY')?.trim();
    this.stripe = key ? new Stripe(key) : null;
  }

  get client(): Stripe {
    if (!this.stripe) throw new ServiceUnavailableException('ระบบชำระเงินยังไม่ได้ตั้งค่า (STRIPE_SECRET_KEY)');
    return this.stripe;
  }

  /** Verifies the Stripe-Signature header against the raw body; throws on a forged or stale event. */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET')?.trim();
    if (!secret) throw new ServiceUnavailableException('STRIPE_WEBHOOK_SECRET is not set');
    return this.client.webhooks.constructEvent(rawBody, signature, secret);
  }
}
