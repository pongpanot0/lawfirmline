'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type CaseUnknownAddressItem } from '@/lib/api';
import { ROLE_LABELS, SIDE_LABELS } from '@/lib/participants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Kind = 'CONTACT' | 'PARTICIPANT';

const errorText = (error: unknown) => (error instanceof ApiError ? error.message : 'บันทึกไม่สำเร็จ');

/** Addresses on this email thread that the case does not know yet; each can be added with one tap. */
export function CaseUnknownAddresses({ caseId, threadId }: { caseId: string; threadId: string }) {
  const { token } = useAuth();
  const [rows, setRows] = useState<CaseUnknownAddressItem[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [openAddress, setOpenAddress] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('PARTICIPANT');
  const [name, setName] = useState('');
  const [role, setRole] = useState('PLAINTIFF');
  const [side, setSide] = useState('OURS');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let active = true;
    api
      .getCaseUnknownAddresses(token, caseId, threadId)
      .then((list) => {
        if (!active) return;
        setRows(list);
        setLoadFailed(false);
      })
      .catch(() => active && setLoadFailed(true));
    return () => {
      active = false;
    };
  }, [token, caseId, threadId]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    api
      .getCase(token, caseId)
      .then((legalCase) => active && setClientId(legalCase.clientId ?? null))
      .catch(() => active && setClientId(null));
    return () => {
      active = false;
    };
  }, [token, caseId]);

  const open = (row: CaseUnknownAddressItem) => {
    setOpenAddress(row.address);
    setKind(clientId ? 'CONTACT' : 'PARTICIPANT');
    setName(row.name ?? '');
    setRole('PLAINTIFF');
    setSide('OURS');
    setError('');
  };

  const submit = async (event: React.FormEvent, row: CaseUnknownAddressItem) => {
    event.preventDefault();
    if (!token || submitting) return;
    if (!name.trim()) {
      setError('กรุณาระบุชื่อ');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (kind === 'CONTACT' && clientId) {
        // No standalone contact endpoint: the client update replaces the whole list, so send the existing contacts back too.
        const client = await api.getClient(token, clientId);
        await api.updateClient(token, client.id, {
          contacts: [
            ...client.contacts,
            { name: name.trim(), email: row.address, isPrimary: client.contacts.length === 0, portalEnabled: false },
          ],
        });
      } else {
        await api.createParticipant(token, caseId, { name: name.trim(), email: row.address, role, side });
      }
      setRows((current) => current.filter((r) => r.address !== row.address));
      setOpenAddress(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadFailed) {
    return (
      <p role="alert" className="text-sm text-destructive">
        โหลดผู้ติดต่อในอีเมลไม่สำเร็จ
      </p>
    );
  }
  if (rows.length === 0) return null;

  return (
    <section aria-label="ผู้ติดต่อที่ยังไม่อยู่ในคดี" className="space-y-2 rounded-lg border border-dashed p-3">
      <h4 className="text-sm font-medium">ผู้ติดต่อที่ยังไม่อยู่ในคดี</h4>
      <ul className="space-y-2">
        {rows.map((row) => {
          const isOpen = openAddress === row.address;
          return (
            <li key={row.address} className="rounded-md bg-muted/30 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  {row.name && <p className="truncate text-sm font-medium">{row.name}</p>}
                  <p className="truncate text-xs text-muted-foreground">{row.address}</p>
                </div>
                {!isOpen && (
                  <Button size="sm" variant="outline" disabled={submitting} onClick={() => open(row)}>
                    เพิ่ม
                  </Button>
                )}
              </div>

              {isOpen && (
                <form onSubmit={(event) => submit(event, row)} className="mt-2 space-y-3">
                  {clientId && (
                    <fieldset className="flex flex-wrap gap-2 text-sm">
                      <legend className="sr-only">เพิ่มเป็น</legend>
                      <label className="inline-flex min-h-11 items-center gap-2">
                        <input type="radio" name={`kind-${row.address}`} checked={kind === 'CONTACT'} onChange={() => setKind('CONTACT')} />
                        ผู้ติดต่อของลูกความ
                      </label>
                      <label className="inline-flex min-h-11 items-center gap-2">
                        <input type="radio" name={`kind-${row.address}`} checked={kind === 'PARTICIPANT'} onChange={() => setKind('PARTICIPANT')} />
                        บุคคลในคดี
                      </label>
                    </fieldset>
                  )}

                  <label className="block text-sm font-medium">
                    ชื่อ
                    <Input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1" />
                  </label>

                  {kind === 'PARTICIPANT' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm font-medium">
                        บทบาท
                        <select value={role} onChange={(event) => setRole(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                          {Object.keys(ROLE_LABELS).map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm font-medium">
                        ฝ่าย
                        <select value={side} onChange={(event) => setSide(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                          {Object.keys(SIDE_LABELS).map((s) => (
                            <option key={s} value={s}>{SIDE_LABELS[s]}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}

                  {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="outline" disabled={submitting} onClick={() => setOpenAddress(null)}>
                      ยกเลิก
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? 'กำลังบันทึก…' : 'บันทึก'}
                    </Button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
