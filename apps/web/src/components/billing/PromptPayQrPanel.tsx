'use client';

import { useEffect, useState } from 'react';
import { Loader2, QrCode, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useDashboardT, useLocale } from '@/components/landing/LocaleProvider';
import { dateLocale, fmt } from '@/lib/i18n/dashboard';

export interface PromptPaySession {
  invoiceId: string;
  chargeId: string;
  amount: number;
  expiresAt: string;
}

interface PromptPayQrPanelProps {
  session: PromptPaySession;
  qrImageUrl: string;
  polling: boolean;
  onRefresh: () => void;
  onCancel: () => void;
  refreshing?: boolean;
}

function formatCountdown(expiresAt: string, expiredLabel: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return expiredLabel;
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function PromptPayQrPanel({
  session,
  qrImageUrl,
  polling,
  onRefresh,
  onCancel,
  refreshing,
}: PromptPayQrPanelProps) {
  const { locale } = useLocale();
  const d = useDashboardT();
  const loc = dateLocale(locale);
  const [countdown, setCountdown] = useState(() => formatCountdown(session.expiresAt, d.payment.qrExpired));
  const expired = countdown === d.payment.qrExpired;

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(formatCountdown(session.expiresAt, d.payment.qrExpired));
    }, 1000);
    return () => clearInterval(timer);
  }, [session.expiresAt, d.payment.qrExpired]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="bg-[#1e4598] px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          <div>
            <p className="font-semibold">{d.payment.promptPayBrand}</p>
            <p className="text-xs text-white/80">{d.payment.scanToPay}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">{d.payment.amountLabel}</p>
          <p className="text-3xl font-bold tracking-tight text-primary">
            {session.amount.toLocaleString(loc)}
            <span className="ml-1 text-base font-medium text-muted-foreground">THB</span>
          </p>
        </div>

        <div className="mx-auto flex max-w-[280px] flex-col items-center gap-3">
          <div
            className={cn(
              'relative rounded-2xl border-2 bg-white p-4 shadow-inner',
              expired ? 'border-destructive/40 opacity-60' : 'border-[#1e4598]/20',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrImageUrl}
              alt="PromptPay QR Code / คิวอาร์โค้ดพร้อมเพย์"
              className="h-52 w-52 object-contain"
            />
            {polling && !expired && (
              <div className="absolute inset-0 flex items-end justify-center rounded-2xl bg-gradient-to-t from-black/5 to-transparent pb-3">
                <Badge variant="muted" className="gap-1 bg-white/95 shadow-sm">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {d.payment.waitingPayment}
                </Badge>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <Badge variant={expired ? 'destructive' : 'muted'}>
              {expired ? d.payment.qrExpired : fmt(d.payment.expiresIn, { time: countdown })}
            </Badge>
            <span>•</span>
            <span>{new Date(session.expiresAt).toLocaleString(loc, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <p>{d.billing.invoice}: {session.invoiceId.slice(0, 8)}…</p>
          <p>Charge / รหัสการชำระ: {session.chargeId}</p>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {d.payment.scanHint}
          <br />
          {d.payment.autoUpdate}
        </p>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
            {expired ? d.payment.newQr : d.payment.refreshQr}
          </Button>
          <Button type="button" variant="ghost" className="flex-1" onClick={onCancel}>
            {d.common.cancel}
          </Button>
        </div>
      </div>
    </div>
  );
}
