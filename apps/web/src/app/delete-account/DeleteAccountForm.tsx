'use client';

import { useState, type FormEvent } from 'react';
import type { LoginResponse, LoginResult } from '@lawfirm/shared';
import { ApiError, request } from '@/lib/api';

type Receipt = { id: string; requestedAt: string; status: 'PENDING_REVIEW' };
const inputClass = 'mt-2 w-full rounded-lg border border-[#142e43]/25 bg-white px-3 py-3 text-base disabled:opacity-60';
const buttonClass = 'w-full rounded-lg bg-[#142e43] px-4 py-3 font-medium text-white disabled:opacity-50';

export function DeleteAccountForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const options = { refreshAuth: false, silent: true };
      if (!session) {
        const result = challenge
          ? await request<LoginResponse>('/auth/mfa/verify', { ...options, token: '', method: 'POST', body: JSON.stringify({ mfaToken: challenge, code }) })
          : await request<LoginResult>('/auth/login', { ...options, token: '', method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase(), password }) });
        if ('mfaRequired' in result) { setChallenge(result.mfaToken); return; }
        setSession(result);
        const existing = await request<Receipt | null>('/auth/account/deletion-request', { ...options, token: result.accessToken });
        if (existing) { setReceipt(existing); setPassword(''); setSession(null); }
      } else {
        if (!confirmed) { setError('โปรดยืนยันว่าต้องการขอลบบัญชีและข้อมูลส่วนบุคคล'); return; }
        const result = await request<Receipt>('/auth/account/deletion-request', { ...options, token: session.accessToken, method: 'POST', body: JSON.stringify({ currentPassword: password }) });
        setReceipt(result); setPassword(''); setCode(''); setSession(null);
      }
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401
        ? 'อีเมล รหัสผ่าน หรือรหัสยืนยันไม่ถูกต้อง หากเซสชันหมดอายุให้เริ่มยืนยันบัญชีอีกครั้ง'
        : 'ติดต่อระบบไม่ได้ กรุณาลองอีกครั้ง หรือส่งคำขอทางอีเมลด้านล่าง');
    } finally { setBusy(false); }
  }

  function restart() {
    setSession(null); setChallenge(null); setCode(''); setPassword(''); setConfirmed(false); setError('');
  }

  if (receipt) return (
    <section className="mt-8 rounded-xl border border-[#142e43]/20 bg-white p-6" role="status">
      <h2 className="text-xl font-semibold">รับคำขอแล้ว / Request received</h2>
      <p className="mt-3 break-all">เลขคำขอ: {receipt.id}</p>
      <p className="mt-2">สถานะ: รอตรวจสอบ · Pending review</p>
      <p className="mt-3 leading-7">บัญชียังไม่ถูกลบในทันที เก็บเลขคำขอไว้ติดต่อทีมดูแลที่ hello@samnuan.co เพื่อสอบถามการดำเนินการและข้อมูลที่ต้องเก็บต่อ</p>
    </section>
  );

  return (
    <form onSubmit={submit} className="mt-8 space-y-5 rounded-xl border border-[#142e43]/15 bg-white p-5 sm:p-7">
      <h2 className="text-xl font-semibold">{session ? 'ยืนยันคำขอลบบัญชี' : 'ยืนยันบัญชีของคุณ / Verify your account'}</h2>
      {session ? <>
        <p className="break-all">บัญชีที่จะขอลบ: <strong>{session.user.email}</strong></p>
        <label className="block text-sm">ยืนยันรหัสผ่านปัจจุบัน<input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={busy} /></label>
        <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} required /><span>ฉันขอลบบัญชี Samnuan และข้อมูลส่วนบุคคลที่เกี่ยวข้องทุกสำนักงาน และเข้าใจว่าทีมดูแลต้องตรวจสอบก่อนดำเนินการ</span></label>
      </> : challenge ? <label className="block text-sm">รหัสยืนยัน 2 ขั้นตอน<input className={inputClass} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required disabled={busy} /></label> : <>
        <label className="block text-sm">อีเมลบัญชี / Account email<input className={inputClass} type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} /></label>
        <label className="block text-sm">รหัสผ่าน / Password<input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={busy} /></label>
      </>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" className={buttonClass} disabled={busy}>{busy ? 'กำลังดำเนินการ…' : session ? 'ส่งคำขอลบบัญชีและข้อมูล' : challenge ? 'ยืนยันรหัส' : 'ยืนยันบัญชีเพื่อส่งคำขอ'}</button>
      {(session || challenge) && <button type="button" onClick={restart} className="w-full py-2 text-sm underline" disabled={busy}>เริ่มยืนยันบัญชีอีกครั้ง</button>}
    </form>
  );
}
