'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SubscriptionPlan } from '@lawfirm/shared';
import { api } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/misc';
import { useDashboardT, useLocale } from '@/components/landing/LocaleProvider';
import { dateLocale, fmt } from '@/lib/i18n/dashboard';
import { CreditCard, QrCode, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PromptPayQrPanel, PromptPaySession } from '@/components/billing/PromptPayQrPanel';

declare global {
  interface Window {
    OmiseCard?: {
      configure: (options: Record<string, unknown>) => void;
      open: (options: Record<string, unknown>) => void;
    };
  }
}

export interface CheckoutPlanInfo {
  plan: SubscriptionPlan;
  name: string;
  priceThb: number;
}

type PaymentMethod = 'promptpay' | 'card';

interface OmiseEmbeddedCheckoutProps {
  plan: CheckoutPlanInfo;
  onSuccess: () => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  className?: string;
  autoOpen?: boolean;
  variant?: React.ComponentProps<typeof Button>['variant'];
  children: React.ReactNode;
}

let scriptPromise: Promise<void> | null = null;

function loadOmiseScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.OmiseCard) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.omise.co/omise.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Omise payment script'));
    document.body.appendChild(script);
  });

  return scriptPromise;
}

export function OmiseEmbeddedCheckout({
  plan,
  onSuccess,
  onError,
  disabled,
  className,
  autoOpen,
  variant,
  children,
}: OmiseEmbeddedCheckoutProps) {
  const { locale } = useLocale();
  const d = useDashboardT();
  const loc = dateLocale(locale);
  const [ready, setReady] = useState(false);
  const [mockMode, setMockMode] = useState(true);
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('promptpay');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState<PromptPaySession | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const publicKeyRef = useRef<string | null>(null);
  const autoOpenedRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrObjectUrlRef = useRef<string | null>(null);

  const reportError = useCallback(
    (message: string) => {
      setError(message);
      onError?.(message);
    },
    [onError],
  );

  const revokeQrUrl = useCallback(() => {
    if (qrObjectUrlRef.current) {
      URL.revokeObjectURL(qrObjectUrlRef.current);
      qrObjectUrlRef.current = null;
    }
    setQrImageUrl(null);
  }, []);

  useEffect(() => {
    api
      .getOmiseConfig()
      .then(async (cfg) => {
        publicKeyRef.current = cfg.publicKey;
        setMockMode(cfg.mockMode);
        if (!cfg.mockMode && cfg.publicKey) {
          await loadOmiseScript();
          window.OmiseCard?.configure({ publicKey: cfg.publicKey });
        }
        setReady(true);
      })
      .catch(() => reportError(d.payment.loadConfigFailed));
  }, [reportError, d.payment.loadConfigFailed]);

  useEffect(
    () => () => {
      revokeQrUrl();
    },
    [revokeQrUrl],
  );

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const loadQrImage = useCallback(
    async (invoiceId: string) => {
      const token = getStoredToken();
      if (!token) throw new Error('Not authenticated');
      revokeQrUrl();
      const blob = await api.getInvoiceQrBlob(token, invoiceId);
      const objectUrl = URL.createObjectURL(blob);
      qrObjectUrlRef.current = objectUrl;
      setQrImageUrl(objectUrl);
    },
    [revokeQrUrl],
  );

  const startPolling = useCallback(
    (invoiceId: string) => {
      stopPolling();
      setPolling(true);

      pollRef.current = setInterval(async () => {
        const token = getStoredToken();
        if (!token) return;
        try {
          const status = await api.getInvoicePaymentStatus(token, invoiceId);
          if (status.status === 'PAID') {
            stopPolling();
            onSuccess();
          } else if (status.status === 'FAILED') {
            stopPolling();
            reportError(d.payment.paymentFailed);
          }
        } catch {
          /* keep polling */
        }
      }, 3000);
    },
    [onSuccess, reportError, stopPolling],
  );

  const resetPromptPay = useCallback(() => {
    stopPolling();
    revokeQrUrl();
    setSession(null);
    setError('');
  }, [stopPolling, revokeQrUrl]);

  const handlePromptPay = async () => {
    const token = getStoredToken();
    if (!token) return;
    setError('');
    setSubmitting(true);
    try {
      const result = await api.checkoutPromptPay(token, plan.plan);
      if (result.paid) {
        onSuccess();
        return;
      }

      const nextSession: PromptPaySession = {
        invoiceId: result.invoiceId,
        chargeId: result.chargeId,
        amount: result.amount,
        expiresAt: result.expiresAt,
      };
      setSession(nextSession);
      await loadQrImage(result.invoiceId);
      startPolling(result.invoiceId);
    } catch (err) {
      reportError(err instanceof Error ? err.message : d.payment.qrFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const refreshQr = async () => {
    if (!session) return;
    const expired = new Date(session.expiresAt).getTime() <= Date.now();
    if (expired) {
      resetPromptPay();
      await handlePromptPay();
      return;
    }
    setSubmitting(true);
    try {
      await loadQrImage(session.invoiceId);
    } catch (err) {
      reportError(err instanceof Error ? err.message : d.payment.qrRefreshFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const completeCardPayment = useCallback(
    async (nonce: string) => {
      const token = getStoredToken();
      if (!token) throw new Error('Not authenticated');

      if (nonce.startsWith('tokn_')) {
        await api.checkout(token, plan.plan, nonce);
        onSuccess();
        return;
      }

      const result = await api.checkout(token, plan.plan, undefined, nonce);
      if (result.success) {
        onSuccess();
        return;
      }
      if (result.invoiceId) {
        startPolling(result.invoiceId);
      }
    },
    [plan.plan, onSuccess, startPolling],
  );

  const openCardCheckout = useCallback(async () => {
    setError('');
    setSubmitting(true);
    try {
      if (mockMode) {
        await completeCardPayment('mock_success');
        return;
      }

      if (!window.OmiseCard || !publicKeyRef.current) {
        throw new Error('Payment form is not ready');
      }

      window.OmiseCard.open({
        amount: plan.priceThb * 100,
        currency: 'THB',
        frameLabel: 'LexFlow',
        frameDescription: `${plan.name} — ${plan.priceThb.toLocaleString()} THB/month`,
        onCreateTokenSuccess: async (nonce: string) => {
          try {
            await completeCardPayment(nonce);
          } catch (err) {
            reportError(err instanceof Error ? err.message : d.payment.paymentFailed);
          } finally {
            setSubmitting(false);
          }
        },
        onFormClosed: () => setSubmitting(false),
      });
    } catch (err) {
      reportError(err instanceof Error ? err.message : d.payment.paymentFailed);
      setSubmitting(false);
    } finally {
      if (mockMode) setSubmitting(false);
    }
  }, [mockMode, plan, completeCardPayment, reportError, d.payment.paymentFailed]);

  const openPanel = useCallback(() => {
    resetPromptPay();
    setOpen(true);
  }, [resetPromptPay]);

  const closePanel = useCallback(() => {
    resetPromptPay();
    setOpen(false);
  }, [resetPromptPay]);

  useEffect(() => {
    if (autoOpen && ready && !autoOpenedRef.current && !disabled) {
      autoOpenedRef.current = true;
      openPanel();
    }
  }, [autoOpen, ready, disabled, openPanel]);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={className}
        disabled={disabled || !ready || submitting || polling}
        onClick={openPanel}
      >
        {submitting || polling ? d.payment.processing : children}
      </Button>

      <Modal open={open} onClose={closePanel} closeOnBackdrop={!polling}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{d.payment.title}</h2>
            <p className="font-medium">{plan.name} Plan</p>
            <p className="text-sm text-muted-foreground">
              {plan.priceThb.toLocaleString(loc)} {d.payment.perMonth}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={closePanel} aria-label={d.common.close}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {mockMode && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {d.payment.testMode}
          </p>
        )}

        {!session && (
          <div className="mb-4 flex gap-2 rounded-lg border border-border bg-background p-1">
            <button
              type="button"
              onClick={() => {
                setMethod('promptpay');
                setError('');
              }}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                method === 'promptpay'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <QrCode className="h-4 w-4" />
              {d.payment.promptPay}
            </button>
            <button
              type="button"
              onClick={() => {
                setMethod('card');
                setError('');
              }}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                method === 'card'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <CreditCard className="h-4 w-4" />
              {d.payment.creditCard}
            </button>
          </div>
        )}

        {method === 'promptpay' ? (
          session && qrImageUrl ? (
            <PromptPayQrPanel
              session={session}
              qrImageUrl={qrImageUrl}
              polling={polling}
              refreshing={submitting}
              onRefresh={refreshQr}
              onCancel={resetPromptPay}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{d.payment.promptPayDesc}</p>
              <Button className="w-full" onClick={handlePromptPay} disabled={submitting}>
                {submitting ? d.payment.generatingQr : d.payment.generateQr}
              </Button>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{d.payment.cardDesc}</p>
            <Button className="w-full" onClick={openCardCheckout} disabled={submitting}>
              {submitting
                ? d.payment.opening
                : fmt(d.payment.payWithCard, { amount: plan.priceThb.toLocaleString(loc) })}
            </Button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </Modal>
    </>
  );
}
