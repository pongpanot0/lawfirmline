'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth, REFRESH_KEY } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardT } from '@/components/landing/LocaleProvider';

export function MfaToggle() {
  const d = useDashboardT();
  const { user, token, applySession } = useAuth();
  const [step, setStep] = useState<'idle' | 'enabling' | 'disabling'>('idle');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const refreshUser = async () => {
    if (!token) return;
    const refreshed = await api.getMe(token);
    applySession(token, localStorage.getItem(REFRESH_KEY) ?? '', refreshed);
  };

  const startEnable = async () => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      await api.requestEnableMfa(token);
      setSent(true);
      setStep('enabling');
    } catch {
      setError(d.settings.mfaRequestFailed);
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      await api.confirmEnableMfa(token, code.trim());
      await refreshUser();
      setStep('idle');
      setCode('');
      setSent(false);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 400 ? d.settings.mfaInvalidCode : d.settings.mfaRequestFailed);
    } finally {
      setBusy(false);
    }
  };

  const confirmDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      await api.disableMfa(token, password);
      await refreshUser();
      setStep('idle');
      setPassword('');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? d.settings.mfaWrongPassword : d.settings.mfaRequestFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{d.settings.mfaTitle}</p>
            <p className="text-xs text-muted-foreground">
              {user?.mfaEnabled ? d.settings.mfaOn : d.settings.mfaOff}
            </p>
          </div>
        </div>
        {step === 'idle' && (
          user?.mfaEnabled ? (
            <Button variant="outline" size="sm" onClick={() => setStep('disabling')}>{d.settings.mfaDisable}</Button>
          ) : (
            <Button variant="outline" size="sm" disabled={busy} onClick={startEnable}>{d.settings.mfaEnable}</Button>
          )
        )}
      </div>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {step === 'enabling' && (
        <form onSubmit={confirmEnable} className="space-y-2 border-t border-border pt-3">
          {sent && <p className="text-xs text-muted-foreground">{d.settings.mfaCodeSentTo} {user?.email}</p>}
          <Input
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            className="text-center text-lg tracking-[0.5em]"
            autoFocus
            required
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={busy || code.length !== 6}>{d.settings.mfaConfirmEnable}</Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setStep('idle'); setCode(''); setError(''); }}>{d.common.cancel}</Button>
          </div>
        </form>
      )}

      {step === 'disabling' && (
        <form onSubmit={confirmDisable} className="space-y-2 border-t border-border pt-3">
          <label className="text-xs text-muted-foreground">{d.settings.mfaEnterPasswordToDisable}</label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="destructive" disabled={busy || !password}>{d.settings.mfaConfirmDisable}</Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setStep('idle'); setPassword(''); setError(''); }}>{d.common.cancel}</Button>
          </div>
        </form>
      )}
    </div>
  );
}
