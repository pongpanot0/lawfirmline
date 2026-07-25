import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'node:https';

export interface ChargeResult {
  id: string;
  paid: boolean;
  status?: string;
  failure_code?: string;
  failure_message?: string;
  expires_at?: string;
  source?: OmiseSource;
}

interface OmiseSource {
  id: string;
  scannable_code?: {
    image?: { download_uri?: string };
  };
}

export interface PromptPayResult {
  chargeId: string;
  sourceId: string;
  qrCodeUrl: string;
  paid: boolean;
  expiresAt: string;
}

@Injectable()
export class OmiseService {
  private readonly logger = new Logger(OmiseService.name);
  private readonly secretKey: string | undefined;
  private readonly mockMode: boolean;
  private readonly skipTlsVerify: boolean;

  constructor(private config: ConfigService) {
    this.secretKey = this.config.get<string>('OMISE_SECRET_KEY');
    this.mockMode = !this.secretKey || this.config.get<string>('OMISE_MOCK') === 'true';
    this.skipTlsVerify = this.config.get<string>('OMISE_SKIP_TLS_VERIFY') === 'true';
    if (this.mockMode) {
      this.logger.warn('Omise running in MOCK mode — set OMISE_SECRET_KEY for production');
    }
    if (this.skipTlsVerify) {
      this.logger.warn('Omise TLS verification disabled (OMISE_SKIP_TLS_VERIFY) — dev only');
    }
  }

  private authHeader() {
    return `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`;
  }

  private omiseRequest<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : undefined;
      const req = https.request(
        {
          hostname: 'api.omise.co',
          path,
          method,
          headers: {
            Authorization: this.authHeader(),
            'Content-Type': 'application/json',
            ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          },
          rejectUnauthorized: !this.skipTlsVerify,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            let parsed: T & { message?: string };
            try {
              parsed = JSON.parse(data) as T & { message?: string };
            } catch {
              reject(new Error(`Invalid Omise response (${res.statusCode})`));
              return;
            }
            if ((res.statusCode ?? 500) >= 400) {
              reject(new Error(parsed.message ?? `Omise request failed (${res.statusCode})`));
              return;
            }
            resolve(parsed);
          });
        },
      );
      req.on('error', (err) => {
        if (err.message.includes('certificate') && !this.skipTlsVerify) {
          reject(
            new Error(
              'TLS certificate error connecting to Omise. Set OMISE_SKIP_TLS_VERIFY=true in .env for local dev, or fix your Node CA certificates.',
            ),
          );
          return;
        }
        reject(err);
      });
      if (payload) req.write(payload);
      req.end();
    });
  }

  private omisePost<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.omiseRequest<T>('POST', path, body);
  }

  private omiseGet<T>(path: string): Promise<T> {
    return this.omiseRequest<T>('GET', path);
  }

  private extractQrDownloadUri(source?: OmiseSource): string | undefined {
    return source?.scannable_code?.image?.download_uri;
  }

  private fetchUrl(
    url: string,
    headers: Record<string, string> = {},
    redirectCount = 0,
  ): Promise<{ data: Buffer; contentType: string }> {
    if (redirectCount > 6) {
      return Promise.reject(new Error('Too many redirects fetching QR image'));
    }

    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const req = https.request(
        {
          hostname: parsed.hostname,
          path: `${parsed.pathname}${parsed.search}`,
          method: 'GET',
          headers,
          rejectUnauthorized: !this.skipTlsVerify,
        },
        (res) => {
          const status = res.statusCode ?? 500;
          const location = res.headers.location;

          if (status >= 300 && status < 400 && location) {
            const nextUrl = new URL(location, url).href;
            resolve(this.fetchUrl(nextUrl, {}, redirectCount + 1));
            return;
          }

          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          res.on('end', () => {
            const data = Buffer.concat(chunks);
            const contentType = (res.headers['content-type'] ?? 'image/svg+xml').split(';')[0].trim();

            if (contentType.includes('text/html')) {
              const html = data.toString('utf-8');
              const match = html.match(/href="([^"]+)"/i);
              if (match?.[1]) {
                resolve(this.fetchUrl(match[1], {}, redirectCount + 1));
                return;
              }
              reject(new Error('Failed to resolve PromptPay QR redirect'));
              return;
            }

            if (status >= 400) {
              reject(new Error(`Failed to fetch QR image (${status})`));
              return;
            }

            resolve({ data, contentType });
          });
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  async fetchQrImage(downloadUri: string): Promise<{ data: Buffer; contentType: string }> {
    return this.fetchUrl(downloadUri, { Authorization: this.authHeader() });
  }

  async getQrImageFromCharge(chargeId: string): Promise<{ data: Buffer; contentType: string }> {
    const charge = await this.getCharge(chargeId);
    const downloadUri = this.extractQrDownloadUri(charge.source);
    if (!downloadUri) {
      throw new Error('PromptPay QR code unavailable on charge');
    }
    return this.fetchQrImage(downloadUri);
  }

  async createChargeWithSource(params: {
    amount: number;
    currency: string;
    source: string;
    description: string;
    metadata?: Record<string, string>;
  }): Promise<ChargeResult> {
    if (this.mockMode) {
      return { id: `chrg_mock_src_${Date.now()}`, paid: false, status: 'pending' };
    }

    try {
      return await this.omisePost<ChargeResult>('/charges', {
        amount: params.amount,
        currency: params.currency,
        source: params.source,
        description: params.description,
        metadata: params.metadata,
      });
    } catch (err) {
      return {
        id: 'unknown',
        paid: false,
        failure_message: err instanceof Error ? err.message : 'Charge failed',
      };
    }
  }

  async createCharge(params: {
    amount: number;
    currency: string;
    card: string;
    description: string;
    metadata?: Record<string, string>;
  }): Promise<ChargeResult> {
    if (this.mockMode) {
      if (params.card === 'mock_fail') {
        return {
          id: `chrg_mock_fail_${Date.now()}`,
          paid: false,
          failure_code: 'mock_declined',
          failure_message: 'Mock payment declined',
        };
      }
      return { id: `chrg_mock_${Date.now()}`, paid: true, status: 'successful' };
    }

    try {
      return await this.omisePost<ChargeResult>('/charges', {
        amount: params.amount,
        currency: params.currency,
        card: params.card,
        description: params.description,
        metadata: params.metadata,
      });
    } catch (err) {
      return {
        id: 'unknown',
        paid: false,
        failure_message: err instanceof Error ? err.message : 'Charge failed',
      };
    }
  }

  async createPromptPayCharge(params: {
    amount: number;
    currency: string;
    description: string;
    metadata?: Record<string, string>;
  }): Promise<PromptPayResult> {
    if (this.mockMode) {
      const chargeId = `chrg_mock_pp_${Date.now()}`;
      const qrData = encodeURIComponent(`mock-promptpay:${chargeId}:${params.amount}`);
      return {
        chargeId,
        sourceId: `src_mock_${Date.now()}`,
        qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${qrData}`,
        paid: false,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };
    }

    const source = await this.omisePost<OmiseSource>('/sources', {
      amount: params.amount,
      currency: params.currency,
      type: 'promptpay',
    });

    let charge = await this.omisePost<ChargeResult>('/charges', {
      amount: params.amount,
      currency: params.currency,
      source: source.id,
      description: params.description,
      metadata: params.metadata,
    });

    let qrDownloadUri =
      this.extractQrDownloadUri(charge.source) ?? this.extractQrDownloadUri(source);

    if (!qrDownloadUri) {
      charge = await this.omiseGet<ChargeResult>(`/charges/${charge.id}`);
      qrDownloadUri = this.extractQrDownloadUri(charge.source);
    }

    if (!qrDownloadUri) {
      throw new Error('PromptPay QR code unavailable');
    }

    const expiresAt =
      charge.expires_at ?? new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return {
      chargeId: charge.id,
      sourceId: charge.source?.id ?? source.id,
      qrCodeUrl: qrDownloadUri,
      paid: charge.paid,
      expiresAt,
    };
  }

  async getCharge(chargeId: string): Promise<ChargeResult> {
    if (this.mockMode) {
      return { id: chargeId, paid: false, status: 'pending' };
    }
    return this.omiseGet<ChargeResult>(`/charges/${chargeId}`);
  }

  getPublicKey(): string | null {
    return this.config.get<string>('OMISE_PUBLIC_KEY') ?? null;
  }

  isMockMode(): boolean {
    return this.mockMode;
  }
}
