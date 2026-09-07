import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';
import { maskEmail } from '@lawfirm/shared';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface InvitationEmailParams {
  to: string;
  firmName: string;
  inviterName: string;
  inviteUrl: string;
  role: string;
  expiresAt: Date;
}

export interface ClientPortalMagicLinkParams {
  to: string;
  contactName: string;
  firmName: string;
  verifyUrl: string;
  expiresAt: Date;
}

export interface ClientPortalInviteEmailParams {
  to: string;
  contactName: string;
  clientName: string;
  firmName: string;
  inviteUrl: string;
  expiresAt: Date;
}

export interface DailyDigestEmailParams {
  to: string;
  recipientName: string;
  /** Human-readable Bangkok date the digest covers, e.g. `อ. 8 ก.ย. 2569`. */
  dayLabel: string;
  /** One line per agenda item, already formatted. */
  lines: string[];
  /** Schedule conflicts to call out above the list. */
  warnings: string[];
  appUrl: string;
}

export interface DocumentPublishedEmailParams {
  to: string;
  contactName: string;
  firmName: string;
  documentTitle: string;
  portalUrl: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKeyConfigured: boolean;

  constructor(private config: ConfigService) {
    const skipTlsVerify = this.config.get<string>('SENDGRID_SKIP_TLS_VERIFY') === 'true';
    if (skipTlsVerify) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      this.logger.warn('SendGrid TLS verification disabled (SENDGRID_SKIP_TLS_VERIFY) — dev only');
    }

    const apiKey = this.config.get<string>('SENDGRID_API_KEY')?.trim();
    this.apiKeyConfigured = Boolean(apiKey);
    if (apiKey) {
      sgMail.setApiKey(apiKey);
    }
  }

  isConfigured(): boolean {
    return this.apiKeyConfigured && Boolean(this.getFromEmail());
  }

  hasApiKey(): boolean {
    return this.apiKeyConfigured;
  }

  getAppUrl(): string {
    const appUrl = this.config.get<string>('APP_URL')?.trim();
    if (appUrl) return appUrl.replace(/\/$/, '');

    const corsOrigin = this.config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3005';
    return corsOrigin.split(',')[0].trim().replace(/\/$/, '');
  }

  private getFromEmail(): string | undefined {
    return this.config.get<string>('SENDGRID_FROM_EMAIL')?.trim() || undefined;
  }

  private getFromName(): string {
    return this.config.get<string>('SENDGRID_FROM_NAME')?.trim() || 'LexFlow';
  }

  async sendInvitationEmail(params: InvitationEmailParams): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL); skipped email to ${params.to}`,
      );
      return;
    }

    const fromEmail = this.getFromEmail()!;
    const expiresLabel = params.expiresAt.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const text = [
      `${params.inviterName} invited you to join ${params.firmName} on LexFlow.`,
      `Role: ${params.role}`,
      `Accept your invitation: ${params.inviteUrl}`,
      `This link expires on ${expiresLabel}.`,
    ].join('\n\n');

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px">
        <h2 style="margin:0 0 12px">You're invited to LexFlow</h2>
        <p><strong>${params.inviterName}</strong> invited you to join <strong>${params.firmName}</strong>.</p>
        <p>Role: <strong>${params.role}</strong></p>
        <p style="margin:24px 0">
          <a href="${params.inviteUrl}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
            Accept invitation
          </a>
        </p>
        <p style="font-size:14px;color:#6b7280">Or copy this link:<br><a href="${params.inviteUrl}">${params.inviteUrl}</a></p>
        <p style="font-size:14px;color:#6b7280">Link expires on ${expiresLabel}.</p>
      </div>
    `.trim();

    try {
      await sgMail.send({
        to: params.to,
        from: { email: fromEmail, name: this.getFromName() },
        subject: `Invitation to join ${params.firmName} on LexFlow`,
        text,
        html,
      });
      this.logger.log(`Invitation email sent to ${maskEmail(params.to)}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'response' in error
            ? JSON.stringify((error as { response?: { body?: unknown } }).response?.body)
            : 'Unknown SendGrid error';
      this.logger.error(`Failed to send invitation email to ${maskEmail(params.to)}: ${message}`);
      throw error;
    }
  }

  async sendClientPortalMagicLinkEmail(params: ClientPortalMagicLinkParams): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL); skipped portal login email to ${params.to}`,
      );
      return;
    }

    const fromEmail = this.getFromEmail()!;
    const expiresLabel = params.expiresAt.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const text = [
      `Sign in to your ${params.firmName} client portal.`,
      `Hi ${params.contactName}, use this link to view your case status, documents, and invoices:`,
      params.verifyUrl,
      `This link expires at ${expiresLabel} and can only be used once.`,
    ].join('\n\n');

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px">
        <h2 style="margin:0 0 12px">Sign in to ${escapeHtml(params.firmName)}</h2>
        <p>Hi <strong>${escapeHtml(params.contactName)}</strong>, use the button below to view your case status, documents, and invoices.</p>
        <p style="margin:24px 0">
          <a href="${params.verifyUrl}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
            Sign in to client portal
          </a>
        </p>
        <p style="font-size:14px;color:#6b7280">Or copy this link:<br><a href="${params.verifyUrl}">${params.verifyUrl}</a></p>
        <p style="font-size:14px;color:#6b7280">This link expires at ${expiresLabel} and can only be used once.</p>
      </div>
    `.trim();

    try {
      await sgMail.send({
        to: params.to,
        from: { email: fromEmail, name: this.getFromName() },
        subject: `Sign in to your ${params.firmName} client portal`,
        text,
        html,
      });
      this.logger.log(`Client portal magic link email sent to ${maskEmail(params.to)}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'response' in error
            ? JSON.stringify((error as { response?: { body?: unknown } }).response?.body)
            : 'Unknown SendGrid error';
      this.logger.error(
        `Failed to send client portal magic link email to ${maskEmail(params.to)}: ${message}`,
      );
      throw error;
    }
  }

  async sendClientPortalInviteEmail(params: ClientPortalInviteEmailParams): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL); skipped portal invite email to ${params.to}`,
      );
      return;
    }

    const fromEmail = this.getFromEmail()!;
    const expiresLabel = params.expiresAt.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const text = [
      `${params.firmName} has invited you to use the client portal for ${params.clientName}.`,
      `Hi ${params.contactName}, accept the invitation to track your case status, documents, and invoices online:`,
      params.inviteUrl,
      `This invitation expires on ${expiresLabel}.`,
    ].join('\n\n');

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px">
        <h2 style="margin:0 0 12px">You're invited to the ${escapeHtml(params.firmName)} client portal</h2>
        <p>Hi <strong>${escapeHtml(params.contactName)}</strong>, ${escapeHtml(params.firmName)} has enabled portal access for <strong>${escapeHtml(params.clientName)}</strong>.</p>
        <p style="margin:24px 0">
          <a href="${params.inviteUrl}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
            Accept invitation
          </a>
        </p>
        <p style="font-size:14px;color:#6b7280">Or copy this link:<br><a href="${params.inviteUrl}">${params.inviteUrl}</a></p>
        <p style="font-size:14px;color:#6b7280">This invitation expires on ${expiresLabel}.</p>
      </div>
    `.trim();

    try {
      await sgMail.send({
        to: params.to,
        from: { email: fromEmail, name: this.getFromName() },
        subject: `You're invited to the ${params.firmName} client portal`,
        text,
        html,
      });
      this.logger.log(`Client portal invite email sent to ${maskEmail(params.to)}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'response' in error
            ? JSON.stringify((error as { response?: { body?: unknown } }).response?.body)
            : 'Unknown SendGrid error';
      this.logger.error(`Failed to send client portal invite email to ${maskEmail(params.to)}: ${message}`);
      throw error;
    }
  }

  /** Fallback for members who have not linked LINE. */
  async sendDailyDigestEmail(params: DailyDigestEmailParams): Promise<boolean> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `SendGrid not configured; skipped daily digest email to ${maskEmail(params.to)}`,
      );
      return false;
    }

    const fromEmail = this.getFromEmail()!;
    const subject = `งานพรุ่งนี้ (${params.dayLabel})`;

    const text = [
      `${subject}`,
      '',
      ...params.lines,
      ...(params.warnings.length ? ['', ...params.warnings] : []),
      '',
      params.appUrl,
    ].join('\n');

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px">
        <h2 style="margin:0 0 12px">${escapeHtml(subject)}</h2>
        <p style="margin:0 0 12px">สวัสดี ${escapeHtml(params.recipientName)}</p>
        <ul style="padding-left:18px;margin:0 0 16px">
          ${params.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
        </ul>
        ${
          params.warnings.length
            ? `<div style="background:#fef3c7;border-radius:8px;padding:12px;margin:0 0 16px">
                 ${params.warnings.map((w) => `<div>⚠️ ${escapeHtml(w)}</div>`).join('')}
               </div>`
            : ''
        }
        <p style="margin:24px 0">
          <a href="${params.appUrl}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
            เปิดวันของฉัน
          </a>
        </p>
      </div>
    `.trim();

    try {
      await sgMail.send({
        to: params.to,
        from: { email: fromEmail, name: this.getFromName() },
        subject,
        text,
        html,
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send daily digest email to ${maskEmail(params.to)}: ${
          error instanceof Error ? error.message : 'Unknown SendGrid error'
        }`,
      );
      return false;
    }
  }

  async sendDocumentPublishedEmail(params: DocumentPublishedEmailParams): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL); skipped document-published email to ${maskEmail(params.to)}`,
      );
      return;
    }

    const fromEmail = this.getFromEmail()!;

    const text = [
      `${params.firmName} has published a new document for you: ${params.documentTitle}`,
      `Hi ${params.contactName}, view it in your client portal:`,
      params.portalUrl,
    ].join('\n\n');

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px">
        <h2 style="margin:0 0 12px">New document from ${escapeHtml(params.firmName)}</h2>
        <p>Hi <strong>${escapeHtml(params.contactName)}</strong>, a new document has been published for you: <strong>${escapeHtml(params.documentTitle)}</strong></p>
        <p style="margin:24px 0">
          <a href="${params.portalUrl}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
            View in client portal
          </a>
        </p>
        <p style="font-size:14px;color:#6b7280">Or copy this link:<br><a href="${params.portalUrl}">${params.portalUrl}</a></p>
      </div>
    `.trim();

    try {
      await sgMail.send({
        to: params.to,
        from: { email: fromEmail, name: this.getFromName() },
        subject: `New document from ${params.firmName}: ${params.documentTitle}`,
        text,
        html,
      });
      this.logger.log(`Document-published email sent to ${maskEmail(params.to)}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'response' in error
            ? JSON.stringify((error as { response?: { body?: unknown } }).response?.body)
            : 'Unknown SendGrid error';
      this.logger.error(`Failed to send document-published email to ${maskEmail(params.to)}: ${message}`);
    }
  }
}
