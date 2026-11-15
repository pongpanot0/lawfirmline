'use client';

import { useEffect, useState } from 'react';
import { api, type DocumentTemplate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { Button } from '@/components/ui/button';

export function SendInvoiceForm({ invoiceId, onCancel, onSent }: { invoiceId: string; onCancel: () => void; onSent: () => void }) {
  const { token } = useAuth();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    if (!token) return;
    let active = true;
    Promise.all([api.getInvoicePrintData(token, invoiceId), api.getBillingDocumentTemplates(token, 'INVOICE')])
      .then(async ([invoice, list]) => {
        const resolved = await api.resolveDocumentTemplate(token, 'INVOICE', invoice.billToCustomer?.id);
        if (active) { setTemplates(list); setTemplateId(resolved.templateId ?? ''); }
      }).catch(() => { if (active) { setLoadFailed(true); setError('โหลดเทมเพลตไม่สำเร็จ ปิดหน้าต่างแล้วลองใหม่'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, invoiceId]);
  return <SideDrawer open title="ส่งใบแจ้งหนี้" onClose={onCancel}>
    <div className="space-y-6 px-6 py-5">
      <label className="block text-sm font-medium">เทมเพลต<select title="เลือกหน้าตาใบแจ้งหนี้" value={templateId} onChange={e => setTemplateId(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3"><option value="">ใช้เทมเพลตที่กำหนดไว้</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><span className="mt-1 block text-xs text-muted-foreground">เลือกหน้าตาที่ใช้กับใบแจ้งหนี้นี้</span></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-3 border-t px-6 py-4"><Button disabled={loading || busy || loadFailed} title="บันทึกสถานะส่งแล้ว" onClick={async () => { if (!token) return; setError(''); setBusy(true); try { await api.markInvoiceSent(token, invoiceId, templateId || undefined); onSent(); } catch (e) { setError(e instanceof Error ? e.message : 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง'); } finally { setBusy(false); } }}>ส่งใบแจ้งหนี้</Button><Button variant="outline" onClick={onCancel} title="ปิดโดยไม่ส่ง">ยกเลิก</Button></div>
    </div>
  </SideDrawer>;
}
