'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ClientItem } from '@/lib/api';
import { AnnualReportListItem, AnnualReportSnapshot, reportAudienceLabel } from '@/lib/annual-report';
import { AnnualReportView } from './AnnualReportView';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/misc';

type Audience = AnnualReportSnapshot['audience'];
type CaseRow = AnnualReportSnapshot['cases'][number];

export function ClientAnnualReportsPanel({
  client,
  token,
  onOpenContacts,
}: {
  client: ClientItem;
  token: string;
  onOpenContacts?: () => void;
}) {
  const [year, setYear] = useState(new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCFullYear() - 1);
  const [audience, setAudience] = useState<Audience>('PAYER');
  const [loaded, setLoaded] = useState(false);
  const [caseSearch, setCaseSearch] = useState('');
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const [availableCases, setAvailableCases] = useState<CaseRow[]>([]);
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ snapshot: AnnualReportSnapshot; fingerprint: string } | null>(null);
  const [reports, setReports] = useState<AnnualReportListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadReports = useCallback(async () => {
    setReports(await api.listClientAnnualReports(token, client.id));
  }, [token, client.id]);

  useEffect(() => {
    void loadReports().catch(() => setError('โหลดรายงานเดิมไม่สำเร็จ'));
  }, [loadReports]);

  useEffect(() => {
    setContactIds((ids) => ids.filter((id) =>
      client.contacts.some((item) => item.id === id && item.portalEnabled),
    ));
  }, [client.contacts]);

  const resetSelection = () => {
    setLoaded(false);
    setCaseIds([]);
    setAvailableCases([]);
    setCaseSearch('');
    setPreview(null);
  };

  const loadCases = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.previewClientAnnualReport(token, client.id, { year, audience });
      setAvailableCases(result.snapshot.cases);
      setCaseIds(result.snapshot.cases.map((item) => item.id));
      setLoaded(true);
      setPreview(null);
    } catch (e) {
      resetSelection();
      setError(e instanceof Error ? e.message : 'โหลดคดีไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const review = async () => {
    if (!caseIds.length) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setPreview(await api.previewClientAnnualReport(token, client.id, { year, audience, caseIds }));
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : 'ตรวจรายงานไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!preview || !caseIds.length || !contactIds.length) return;
    setBusy(true);
    setError('');
    try {
      await api.publishClientAnnualReport(token, client.id, {
        year, audience, caseIds, contactIds, fingerprint: preview.fingerprint,
      });
      await loadReports();
      setNotice('เผยแพร่รายงานให้ผู้ติดต่อที่เลือกแล้ว');
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เผยแพร่ไม่สำเร็จ');
      setPreview(null);
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  const revoke = async (id: string) => {
    const target = reports.find((r) => r.id === id);
    if (!window.confirm(`ถอนรายงานปี ${target ? target.year + 543 : ''} ของ ${client.name} จากพอร์ทัล? ผู้รับจะเปิดรายงานไม่ได้ทันที`)) return;
    setBusy(true);
    setError('');
    try {
      await api.revokeClientAnnualReport(token, client.id, id);
      await loadReports();
      setNotice('ถอนรายงานจากพอร์ทัลแล้ว');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ถอนไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const contacts = client.contacts.filter((item) => item.id && item.portalEnabled);
  const selectedContacts = contacts.filter((item) => contactIds.includes(item.id!));
  const query = caseSearch.trim().toLocaleLowerCase();
  const visibleCases = availableCases.filter((item) =>
    [item.ownRef, item.title, item.customerRef].some((value) =>
      value?.toLocaleLowerCase().includes(query),
    ),
  );
  const missingClose = preview?.snapshot.cases.filter((item) => item.closedAt && !item.closingSummary?.trim()) ?? [];
  const yearCompleted = year < new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCFullYear();
  const canPublish = Boolean(
    preview && yearCompleted && contactIds.length && !busy &&
    !missingClose.length && !preview.snapshot.totals.unassignedInvoiceCount,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-xl font-bold">รายงานประจำปี {client.name}</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            คดีที่เลือก ตัวเลขที่ตรวจแล้ว และผู้ติดต่อที่เปิดรายงานได้
          </p>
        </div>
        <p className="text-2xl font-semibold tabular-nums">{year + 543}</p>
      </header>

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">{notice}</p>}
      {contacts.length === 0 && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
          ยังไม่มีผู้ติดต่อที่เปิดสิทธิ์พอร์ทัล
          {onOpenContacts && (
            <button type="button" onClick={onOpenContacts} className="ml-2 inline-flex min-h-11 items-center font-semibold underline sm:min-h-0">
              จัดการผู้ติดต่อก่อนทำรายงาน
            </button>
          )}
        </p>
      )}

      <section className="rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="annual-scope">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">1</span>
          <div>
            <h3 id="annual-scope" className="font-semibold">กำหนดขอบเขตรายงาน</h3>
            <p className="text-sm text-muted-foreground">ปีปฏิทินไทย และบทบาทที่ลูกค้ารายนี้เกี่ยวข้องกับคดี</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">ปี พ.ศ.</span>
            <input
              type="number" min={2543} max={2643} value={year + 543}
              disabled={busy}
              onChange={(e) => { setYear(Number(e.target.value) - 543); resetSelection(); }}
              className="h-10 w-32 rounded-md border bg-background px-3 tabular-nums"
            />
          </label>
          <label className="min-w-56 text-sm">
            <span className="mb-1 block font-medium">ความสัมพันธ์กับคดี</span>
            <select
              value={audience}
              disabled={busy}
              onChange={(e) => { setAudience(e.target.value as Audience); resetSelection(); }}
              className="h-10 w-full rounded-md border bg-background px-3"
            >
              <option value="PAYER">ผู้ว่าจ้าง / ผู้จ่ายเงิน</option>
              <option value="REPRESENTED">ลูกความ</option>
            </select>
          </label>
          <Button type="button" variant="outline" onClick={() => void loadCases()} disabled={busy || year < 2000 || year > 2100}>
            {busy && !loaded ? 'กำลังค้นหา...' : 'ค้นหาคดี'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          ระบบค้นหาคดีที่ดำเนินอยู่ระหว่าง 1 มกราคม – 31 ธันวาคม รวมคดีที่เปิดก่อนปีนี้
        </p>

        {loaded && (
          <div className="mt-6 border-t pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold tabular-nums">คดีที่เกี่ยวข้อง {availableCases.length} เรื่อง</h4>
                <p className="text-sm tabular-nums text-muted-foreground">เลือกไว้ {caseIds.length} เรื่อง</p>
              </div>
              {availableCases.length > 0 && (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setCaseIds(availableCases.map((item) => item.id)); setPreview(null); }}>
                    เลือกทั้งหมด
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setCaseIds([]); setPreview(null); }}>
                    ล้างที่เลือก
                  </Button>
                </div>
              )}
            </div>
            {availableCases.length === 0 ? (
              <p className="mt-4 rounded-lg bg-muted p-4 text-sm">
                ไม่พบคดีในปีและบทบาทนี้ ลองเปลี่ยนบทบาทลูกค้าหรือปี แล้วค้นหาใหม่
              </p>
            ) : (
              <>
                {availableCases.length > 6 && (
                  <label className="mt-4 block text-sm">
                    <span className="sr-only">ค้นหาคดีในรายการ</span>
                    <input
                      type="search" value={caseSearch} onChange={(e) => setCaseSearch(e.target.value)}
                      placeholder="ค้นชื่อคดี เลขสำนักงาน หรือ Customer Ref"
                      className="h-10 w-full rounded-md border bg-background px-3"
                    />
                  </label>
                )}
                <div className="mt-3 divide-y rounded-lg border">
                  {visibleCases.map((item) => {
                    const gaps = [
                      !item.customerRef ? 'Customer Ref' : null,
                      item.policyRelevant && !item.policyRef ? 'Policy Ref' : null,
                      item.closedAt && !item.closingSummary?.trim() ? 'รายละเอียดปิดคดี' : null,
                    ].filter(Boolean);
                    return (
                      <div key={item.id} className="flex items-start gap-3 p-3 sm:p-4">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                          <input
                            type="checkbox" checked={caseIds.includes(item.id)}
                            disabled={busy}
                            onChange={(e) => {
                              setCaseIds((ids) => e.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id));
                              setPreview(null);
                            }}
                            className="mt-1 size-4 shrink-0 accent-primary"
                          />
                          <span className="min-w-0">
                            <span className="block font-medium">{item.title}</span>
                            <span className="block text-xs text-muted-foreground">
                              {item.ownRef} · {item.clientName || 'ไม่ระบุชื่อลูกความ'}
                            </span>
                            {gaps.length > 0 && (
                              <span className="mt-1 block text-xs text-warning">ควรตรวจ: {gaps.join(', ')}</span>
                            )}
                          </span>
                        </label>
                        <Link href={'/cases/' + item.id} className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-primary hover:underline sm:min-h-0">
                          เปิดคดี
                        </Link>
                      </div>
                    );
                  })}
                  {visibleCases.length === 0 && <p className="p-4 text-sm text-muted-foreground">ไม่พบคดีที่ตรงกับคำค้น</p>}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="annual-review">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">2</span>
          <div>
            <h3 id="annual-review" className="font-semibold">ตรวจฉบับที่จะเผยแพร่</h3>
            <p className="text-sm text-muted-foreground">ตัวเลขและรายละเอียดมาจากคดีที่เลือกเท่านั้น</p>
          </div>
        </div>
        <Button type="button" variant="outline" className="mt-5" disabled={busy || !caseIds.length} onClick={() => void review()}>
          {busy && loaded ? 'กำลังจัดรายงาน...' : preview ? 'ตรวจรายงานอีกครั้ง' : 'ดูตัวอย่างรายงาน'}
        </Button>
        {!loaded && <p className="mt-3 text-sm text-muted-foreground">เริ่มจากค้นหาคดีในข้อ 1</p>}
        {loaded && !caseIds.length && <p className="mt-3 text-sm text-muted-foreground">เลือกคดีอย่างน้อยหนึ่งเรื่องเพื่อดูรายงาน</p>}
        {preview && (
          <div className="mt-5 space-y-4">
            {missingClose.length > 0 && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                มีคดีปิดแล้ว {missingClose.length} เรื่องที่ยังไม่มีรายละเอียดปิดคดี กรุณาเปิดคดีเติมข้อมูลก่อนเผยแพร่
              </p>
            )}
            {!!preview.snapshot.totals.unassignedInvoiceCount && (
              <p role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
                ใบแจ้งหนี้ {preview.snapshot.totals.unassignedInvoiceCount} รายการยังไม่ระบุผู้รับ ต้องตรวจในคดีก่อนเผยแพร่
              </p>
            )}
            <div className="rounded-lg border bg-card p-4 sm:p-6">
              <AnnualReportView report={preview.snapshot} />
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="annual-recipients">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">3</span>
          <div>
            <h3 id="annual-recipients" className="font-semibold">เลือกผู้รับและเผยแพร่</h3>
            <p className="text-sm text-muted-foreground">รายงานจะแสดงเฉพาะผู้ติดต่อที่เลือกและเปิดสิทธิ์พอร์ทัลแล้ว</p>
          </div>
        </div>
        {contacts.length === 0 ? (
          <div className="mt-5 rounded-lg bg-muted p-4 text-sm">
            ยังไม่มีผู้ติดต่อที่เปิดสิทธิ์พอร์ทัล
            {onOpenContacts && (
              <button type="button" onClick={onOpenContacts} className="ml-2 inline-flex min-h-11 items-center font-medium text-primary hover:underline sm:min-h-0">
                ไปจัดการผู้ติดต่อ
              </button>
            )}
          </div>
        ) : (
          <fieldset className="mt-5 space-y-2">
            <legend className="sr-only">ผู้ติดต่อที่รับรายงาน</legend>
            {contacts.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm hover:bg-muted/50">
                <input
                  type="checkbox" checked={contactIds.includes(item.id!)}
                  disabled={busy}
                  onChange={(e) => setContactIds((ids) => e.target.checked ? [...ids, item.id!] : ids.filter((id) => id !== item.id))}
                  className="size-4 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block font-medium">{item.name}</span>
                  {item.email && <span className="block truncate text-xs text-muted-foreground">{item.email}</span>}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {!yearCompleted && <p className="mt-4 text-sm text-warning">เผยแพร่รายงานประจำปีได้หลังสิ้นปีที่เลือก</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-5">
          <Button type="button" disabled={!canPublish} onClick={() => setConfirmOpen(true)}>
            ยืนยันผู้รับและเผยแพร่
          </Button>
          <p className="text-xs text-muted-foreground">
            {preview ? 'ตรวจแล้ว ' + preview.snapshot.totals.cases + ' คดี' : 'ยังไม่ได้ตรวจตัวอย่าง'}
            {' · '}ผู้รับ {selectedContacts.length} คน
          </p>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="annual-history">
        <h3 id="annual-history" className="font-semibold">รายงานที่เคยเผยแพร่</h3>
        {reports.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">ยังไม่มีรายงานที่เผยแพร่ให้ลูกค้ารายนี้</p>
        ) : (
          <ul className="mt-3 divide-y">
            {reports.map((item) => (
              <li key={item.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    <strong>ปี {item.year + 543}</strong> · {reportAudienceLabel(item.audience)}
                    {' '}<Badge variant={item.revokedAt ? 'muted' : 'success'}>{item.revokedAt ? 'ถอนแล้ว' : 'เผยแพร่แล้ว'}</Badge>
                    {' · '}ผู้รับ {item.recipientContactIds?.length ?? 0} คน
                  </span>
                  {!item.revokedAt && (
                    <Button type="button" variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={() => void revoke(item.id)}>
                      ถอนจากพอร์ทัล
                    </Button>
                  )}
                </div>
                {item.snapshot && (
                  <details className="mt-2">
                    <summary className="flex min-h-11 cursor-pointer items-center text-primary">ดูฉบับที่เผยแพร่</summary>
                    <div className="mt-3 rounded-lg border bg-card p-4">
                      <AnnualReportView report={item.snapshot} />
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} ariaLabel="ยืนยันการเผยแพร่รายงาน" className="max-w-lg">
        <h3 className="text-lg font-semibold">เผยแพร่รายงานปี {year + 543}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {client.name} · {reportAudienceLabel(audience)} · {preview?.snapshot.totals.cases ?? 0} คดี
        </p>
        <p className="mt-5 text-sm font-medium">ผู้ติดต่อที่จะเปิดรายงานฉบับนี้ได้</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
          {selectedContacts.map((item) => <li key={item.id}>{item.name}</li>)}
        </ul>
        <p className="mt-4 rounded-lg bg-warning/10 p-3 text-xs text-foreground">
          หากมีฉบับเดิมของปีและบทบาทเดียวกัน ระบบจะถอนฉบับเดิมเมื่อเผยแพร่ฉบับนี้
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>กลับไปตรวจ</Button>
          <Button type="button" onClick={() => void publish()} disabled={!canPublish}>
            {busy ? 'กำลังเผยแพร่...' : 'เผยแพร่ให้ผู้รับที่เลือก'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
