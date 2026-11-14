'use client';

import { useEffect, useRef, useState } from 'react';
import { canBuyAddOns, hasFirmCapability, type AiCreditsEstimate, type BillingUsage } from '@lawfirm/shared';
import { FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/misc';
import { AddOnDialog } from './AddOnDialog';

type FileRow = { id: string; name: string };
export function useAiCreditConfirm() {
  const { token, user } = useAuth();
  const [estimate, setEstimate] = useState<AiCreditsEstimate | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [error, setError] = useState('');
  const estimating = useRef(false);
  const resolve = useRef<((value: boolean) => void) | null>(null);
  useEffect(() => () => { resolve.current?.(false); }, []);
  const confirmCredits = async (rows: FileRow[]) => {
    if (!token || resolve.current || estimating.current) return false;
    estimating.current = true;
    let result: AiCreditsEstimate;
    try { result = await api.estimateAiCredits(token, rows.map((r) => r.id)); } finally { estimating.current = false; }
    if (result.balance.unlimited) return true;
    setFiles(rows); setEstimate(result); setError('');
    return new Promise<boolean>((done) => { resolve.current = done; });
  };
  const answer = (value: boolean) => { resolve.current?.(value); resolve.current = null; setEstimate(null); };
  const owner = hasFirmCapability(user?.firmRole, 'manageSubscription');
  const buy = owner && canBuyAddOns(user?.subscriptionPlan);
  const remaining = estimate?.balance.remaining ?? 0;
  const enough = !!estimate && remaining >= estimate.total;
  const openTopup = async () => { if (!token) return; try { setUsage(await api.getBillingUsage(token)); } catch (e) { setError(e instanceof Error ? e.message : 'โหลดแพ็กเกจไม่สำเร็จ'); } };
  const dialog = <><Modal open={!!estimate && !usage} onClose={() => answer(false)} ariaLabel="ยืนยันก่อนให้ AI อ่านเอกสาร" className="max-w-xl rounded-lg">
    {estimate && <><h2 className="border-b pb-4 text-xl font-semibold">ยืนยันก่อนให้ AI อ่าน {estimate.items.length} ไฟล์</h2><div className="mt-5 overflow-hidden rounded-lg border bg-muted/30">{estimate.items.map((item) => <div key={item.documentId} className="flex items-center gap-3 border-b p-3 last:border-0"><FileText className="h-5 w-5 shrink-0" /><div className="min-w-0 flex-1"><p className="break-words font-medium">{files.find((f) => f.id === item.documentId)?.name ?? item.documentId}</p><p className="text-sm text-muted-foreground">{item.scanned ? `สแกน ${item.pages} หน้า` : 'ไฟล์ข้อความ'}</p></div><span className="whitespace-nowrap text-sm">{item.credits} เครดิต</span></div>)}</div>
    {enough ? <div className="mt-5 border-t pt-4"><p className="text-lg font-semibold">รวม {estimate.total} เครดิต</p><p className="text-sm text-muted-foreground">เหลือ {remaining} เครดิต · หลังอ่านจะเหลือ {remaining - estimate.total}</p></div> : <p role="alert" className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive">ต้องใช้ {estimate.total} เครดิต แต่เหลือ {remaining} เครดิต</p>}
    <p className="mt-4 text-sm text-muted-foreground">เอกสารสแกนคิด 1 เครดิตต่อ 2 หน้า</p>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="mt-5 flex flex-wrap justify-end gap-2"><Button title="ยกเลิกการอ่าน" variant="outline" onClick={() => answer(false)}>ยกเลิก</Button>{enough ? <Button title="ยืนยันให้ AI อ่าน" className="whitespace-nowrap" onClick={() => answer(true)}>ให้ AI อ่าน · ใช้ {estimate.total} เครดิต</Button> : buy ? <Button title="เลือกแพ็กเกจเครดิต AI" className="whitespace-nowrap" onClick={openTopup}>เติมเครดิต AI</Button> : owner ? <a href="/account/billing#plans" title="ดูแพ็กเกจที่ใช้ AI ได้มากขึ้น" className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">อัปเกรดแพ็กเกจ</a> : <p className="text-sm">ติดต่อเจ้าของสำนักงานเพื่อเติมเครดิต</p>}</div></>}
  </Modal>{usage && token && <AddOnDialog type="ai" usage={usage} token={token} onClose={() => setUsage(null)} />}</>;
  return { confirmCredits, dialog };
}
