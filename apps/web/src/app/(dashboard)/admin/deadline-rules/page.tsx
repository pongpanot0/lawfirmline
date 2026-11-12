'use client';

import { useEffect, useState } from 'react';
import { Plus, MoreHorizontal } from 'lucide-react';
import {
  COURT_EVENT_KIND_LABELS,
  COURT_LEVEL_LABELS,
  CourtEventKind,
  CourtLevel,
  DeadlineDayBasis,
  DeadlineTrigger,
  PARTY_ROLE_LABELS,
  PartyRole,
  SERVICE_METHOD_LABELS,
  ServiceMethod,
  hasFirmCapability,
} from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, DeadlineRuleItem } from '@/lib/api';
import { firmRuleRows, offsetText, RuleOrigin } from '@/lib/deadline-rules';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardT, useLocale } from '@/components/landing/LocaleProvider';
import { InlineEmptyState, Skeleton } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { confirmDialog } from '@/lib/confirm-dialog';
import { Select } from '@/components/ui/select';

const SELECT = 'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

type Form = {
  label: string;
  trigger: DeadlineTrigger;
  offsetDays: number;
  dayBasis: DeadlineDayBasis;
  adjustDays: number;
  courtEventKind: CourtEventKind | '';
  courtLevel: CourtLevel | '';
  partySide: PartyRole | '';
  serviceMethod: ServiceMethod | '';
  isActive: boolean;
  global: boolean;
  /** Set when customising a global rule: the label must stay equal to override it. */
  lockLabel: boolean;
};

const EMPTY: Form = {
  label: '', trigger: DeadlineTrigger.COURT_DATE, offsetDays: 30, dayBasis: DeadlineDayBasis.CALENDAR,
  adjustDays: 0, courtEventKind: '', courtLevel: '', partySide: '', serviceMethod: '',
  isActive: true, global: false, lockLabel: false,
};

const fromRule = (rule: DeadlineRuleItem, patch: Partial<Form> = {}): Form => ({
  label: rule.label, trigger: rule.trigger, offsetDays: rule.offsetDays, dayBasis: rule.dayBasis,
  adjustDays: rule.adjustDays, courtEventKind: rule.courtEventKind ?? '', courtLevel: (rule.courtLevel ?? '') as CourtLevel | '',
  partySide: (rule.partySide ?? '') as PartyRole | '', serviceMethod: rule.serviceMethod ?? '',
  isActive: rule.isActive, global: false, lockLabel: true, ...patch,
});

/**
 * Filters only mean something for their own trigger; anything else is sent as null.
 * A customised global rule (lockLabel) keeps exactly the filters it was copied with.
 */
const payload = (f: Form) => ({
  label: f.label,
  trigger: f.trigger,
  offsetDays: Number(f.offsetDays),
  dayBasis: f.dayBasis,
  adjustDays: Number(f.adjustDays),
  courtEventKind: f.lockLabel || f.trigger === DeadlineTrigger.COURT_DATE ? f.courtEventKind || null : null,
  courtLevel: f.lockLabel || f.trigger === DeadlineTrigger.JUDGMENT ? f.courtLevel || null : null,
  partySide: f.partySide || null,
  serviceMethod: f.lockLabel || f.trigger === DeadlineTrigger.COMPLAINT_SERVED ? f.serviceMethod || null : null,
  isActive: f.isActive,
  ...(f.global ? { global: true } : {}),
});

export default function DeadlineRulesPage() {
  const { token, user } = useAuth();
  const d = useDashboardT();
  const { locale } = useLocale();
  const t = d.deadlineRules;
  const [rules, setRules] = useState<DeadlineRuleItem[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<'active' | 'inactive' | 'custom'>('active');
  const [undo, setUndo] = useState<{ label: string; wasActive: boolean; action: () => Promise<unknown> } | null>(null);
  useEffect(() => { if (!undo) return; const timer = setTimeout(() => setUndo(null), 10000); return () => clearTimeout(timer); }, [undo]);

  const load = () => {
    if (!token) return;
    setLoadError(false);
    api.getDeadlineRules(token)
      .then(setRules)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, [token]);

  if (!hasFirmCapability(user?.firmRole, 'manageFirmContent')) {
    return <p className="text-destructive">{d.admin.accessDenied}</p>;
  }
  const isPlatformAdmin = rules.some((rule) => rule.firmId === null && rule.canEdit);
  const rows = firmRuleRows(rules, user!.firmId);

  const run = async (action: () => Promise<unknown>) => {
    if (!token || busy) return;
    setError('');
    setBusy(true);
    try {
      await action();
      setForm(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (rule: DeadlineRuleItem, viaOverride: boolean) => {
    if (!token || busy || !await confirmDialog(rule.isActive
      ? `ปิดกฎ "${rule.label}" สำหรับทั้งสำนักงาน?\nคดีต่อจากนี้จะไม่ได้วันครบกำหนดจากกฎนี้ เปิดกลับได้ภายหลัง`
      : `เปิดกฎ "${rule.label}" สำหรับทั้งสำนักงาน?\nคดีต่อจากนี้จะได้วันครบกำหนดจากกฎนี้`)) return;
    setBusy(true);
    setError('');
    try {
      if (viaOverride) {
        const created = await api.createDeadlineRule(token, payload(fromRule(rule, { isActive: !rule.isActive })));
        setUndo({ label: rule.label, wasActive: rule.isActive, action: () => api.deleteDeadlineRule(token, created.id) });
      } else {
        await api.updateDeadlineRule(token, rule.id, { isActive: !rule.isActive });
        setUndo({ label: rule.label, wasActive: rule.isActive, action: () => api.updateDeadlineRule(token, rule.id, { isActive: rule.isActive }) });
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveFailed);
    } finally { setBusy(false); }
  };

  const remove = async (rule: DeadlineRuleItem) => {
    if (await confirmDialog(`${t.confirmDelete}\n${rule.label}`)) run(() => api.deleteDeadlineRule(token!, rule.id));
  };

  const describe = (rule: DeadlineRuleItem) =>
    [
      `${t.triggers[rule.trigger]} ${offsetText(rule, locale)}`,
      rule.courtEventKind && COURT_EVENT_KIND_LABELS[rule.courtEventKind],
      rule.courtLevel && COURT_LEVEL_LABELS[rule.courtLevel as CourtLevel],
      rule.partySide && PARTY_ROLE_LABELS[rule.partySide as PartyRole],
      rule.serviceMethod && SERVICE_METHOD_LABELS[rule.serviceMethod],
    ].filter(Boolean).join(' · ');

  // origin null = the platform-admin section, the only place a global rule is edited or deleted.
  const row = (rule: DeadlineRuleItem, origin: RuleOrigin | null) => {
    const fromGlobal = origin === 'GLOBAL';
    return (
    <li key={rule.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4 sm:rounded-none sm:border-0 sm:border-b">
      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
        <div className="font-semibold text-foreground">{rule.label} {origin && <Badge variant="muted" className="ml-2 align-middle">{t.origin[origin]}</Badge>}</div>
        <p className="mt-1 text-sm text-muted-foreground">{describe(rule)}</p>
      </div>
      <div className="flex w-full items-center justify-between gap-3 border-t pt-3 sm:w-auto sm:border-0 sm:pt-0">
        <button type="button" role="switch" aria-checked={rule.isActive} aria-label={rule.label} disabled={busy} onClick={() => void toggle(rule, fromGlobal)} className="flex min-h-11 items-center gap-2 text-sm">
          <span className={`relative h-7 w-12 rounded-full ${rule.isActive ? 'bg-primary' : 'bg-muted-foreground'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white ${rule.isActive ? 'right-1' : 'left-1'}`} /></span>
          {rule.isActive ? 'ใช้งาน' : 'ปิดอยู่'}
        </button>
        {(fromGlobal || rule.canEdit) && <details className="relative">
          <summary className="disclosure flex min-h-11 min-w-11 cursor-pointer items-center justify-center" aria-label={`จัดการ ${rule.label}`}><MoreHorizontal className="size-5" /></summary>
          <div className="absolute right-0 z-10 w-56 rounded-lg border bg-card p-2 shadow-lg">
            {fromGlobal && <button type="button" className="w-full p-2 text-left text-sm hover:bg-muted" onClick={() => setForm(fromRule(rule))}>ปรับแก้สำหรับสำนักงาน</button>}
            {rule.canEdit && !fromGlobal && <button type="button" className="w-full p-2 text-left text-sm hover:bg-muted" onClick={() => remove(rule)}>{origin === 'OVERRIDE' ? 'กลับไปใช้กฎกลาง' : 'ลบ'}</button>}
          </div>
        </details>}
      </div>
    </li>
    );
  };

  const field = (label: string, input: React.ReactNode, wide = false) => (
    <label className={`text-sm ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block font-medium">{label}</span>
      {input}
    </label>
  );

  return (
    <div>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <Button size="sm" aria-expanded={!!form} onClick={() => setForm(form ? null : EMPTY)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t.add}
          </Button>
        }
      />

      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}

      {form && (
        <Card className="mb-4">
          <CardContent className="pt-6">
            <form
              onSubmit={(e) => { e.preventDefault(); run(() => api.createDeadlineRule(token!, payload(form))); }}
              className="grid gap-3 sm:grid-cols-2"
            >
              {form.lockLabel && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground sm:col-span-2">{t.overrideNote}</p>}
              {field(t.label, <Input required readOnly={form.lockLabel} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />)}
              {field(t.trigger, (
                <Select className={SELECT} disabled={form.lockLabel} value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value as DeadlineTrigger })}>
                  {Object.values(DeadlineTrigger).map((x) => <option key={x} value={x}>{t.triggers[x]}</option>)}
                </Select>
              ))}
              {field(`${t.offsetDays} — ${t.offsetHint}`, (
                <Input type="number" min={-3650} max={3650} required value={form.offsetDays} onChange={(e) => setForm({ ...form, offsetDays: Number(e.target.value) })} />
              ))}
              {field(t.dayBasis, (
                <Select className={SELECT} value={form.dayBasis} onChange={(e) => setForm({ ...form, dayBasis: e.target.value as DeadlineDayBasis })}>
                  {Object.values(DeadlineDayBasis).map((x) => <option key={x} value={x}>{t.bases[x]}</option>)}
                </Select>
              ))}
              {field(t.adjustDays, (
                <Input type="number" min={-3650} max={3650} value={form.adjustDays} onChange={(e) => setForm({ ...form, adjustDays: Number(e.target.value) })} />
              ))}
              {field(t.partySide, (
                <Select className={SELECT} value={form.partySide} onChange={(e) => setForm({ ...form, partySide: e.target.value as PartyRole | '' })}>
                  <option value="">{t.any}</option>
                  {Object.values(PartyRole).map((x) => <option key={x} value={x}>{PARTY_ROLE_LABELS[x]}</option>)}
                </Select>
              ))}
              {form.trigger === DeadlineTrigger.COURT_DATE && field(t.courtEventKind, (
                <Select className={SELECT} value={form.courtEventKind} onChange={(e) => setForm({ ...form, courtEventKind: e.target.value as CourtEventKind | '' })}>
                  <option value="">{t.any}</option>
                  {Object.values(CourtEventKind).map((x) => <option key={x} value={x}>{COURT_EVENT_KIND_LABELS[x]}</option>)}
                </Select>
              ))}
              {form.trigger === DeadlineTrigger.JUDGMENT && field(t.courtLevel, (
                <Select className={SELECT} value={form.courtLevel} onChange={(e) => setForm({ ...form, courtLevel: e.target.value as CourtLevel | '' })}>
                  <option value="">{t.any}</option>
                  {Object.values(CourtLevel).map((x) => <option key={x} value={x}>{COURT_LEVEL_LABELS[x]}</option>)}
                </Select>
              ))}
              {form.trigger === DeadlineTrigger.COMPLAINT_SERVED && field(t.serviceMethod, (
                <Select className={SELECT} value={form.serviceMethod} onChange={(e) => setForm({ ...form, serviceMethod: e.target.value as ServiceMethod | '' })}>
                  <option value="">{t.any}</option>
                  {Object.values(ServiceMethod).map((x) => <option key={x} value={x}>{SERVICE_METHOD_LABELS[x]}</option>)}
                </Select>
              ))}
              {isPlatformAdmin && !form.lockLabel && (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={form.global} onChange={(e) => setForm({ ...form, global: e.target.checked })} />
                  {t.global}
                </label>
              )}
              <div className="flex flex-wrap justify-end gap-2 border-t pt-4 sm:col-span-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setForm(null)}>{d.common.cancel}</Button>
                <Button type="submit" size="sm" disabled={busy}>{t.save}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 rounded-lg border-l-4 border-[var(--color-brass)] bg-[var(--operations-highlight)] p-4 text-sm">สำนักงานใช้กฎ {rows.filter(({ rule }) => rule.isActive).length} ข้อ · ปิดอยู่ {rows.filter(({ rule }) => !rule.isActive).length} · ปรับเองโดยสำนักงาน {rows.filter(({ origin }) => origin !== 'GLOBAL').length}<p className="mt-1 text-muted-foreground">การปิดหรือเปิดกฎมีผลกับคดีใหม่ทั้งสำนักงาน ระบบจะถามยืนยันก่อนทุกครั้ง และย้อนกลับได้ภายใน 10 วินาที</p></div>
      <div className="mb-4 grid grid-cols-3 rounded-lg border bg-card p-1">
        {([['active', 'ใช้งาน', rows.filter(({ rule }) => rule.isActive).length], ['inactive', 'ปิดอยู่', rows.filter(({ rule }) => !rule.isActive).length], ['custom', 'ปรับเองโดยสำนักงาน', rows.filter(({ origin }) => origin !== 'GLOBAL').length]] as const).map(([key, label, count]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)} className={`min-h-11 rounded p-2 text-sm ${tab === key ? 'border-b-2 border-primary bg-muted font-semibold' : 'text-muted-foreground'}`}>{label} <span>{count}</span></button>)}
      </div>
      {undo && <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-primary p-4 text-primary-foreground">{undo.wasActive ? 'ปิด' : 'เปิด'}กฎ “{undo.label}” แล้ว <button type="button" className="underline" disabled={busy} onClick={() => { const action = undo.action; setUndo(null); void run(action); }}>เลิกทำ</button></div>}
      <Card>
        <CardContent className="p-0">
          {loadError ? (
            <LoadFailed onRetry={load} />
          ) : loading ? (
            <div role="status" aria-label={d.common.loading} className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <InlineEmptyState title={t.empty} description="กฎที่ตั้งไว้ใช้คำนวณวันครบกำหนดตามเหตุการณ์ของคดี" action={<Button size="sm" variant="outline" onClick={() => setForm(EMPTY)}><Plus className="h-4 w-4" aria-hidden />{t.add}</Button>} />
          ) : (
            <ul className="space-y-3 sm:space-y-0">{rows.filter(({ rule, origin }) => tab === 'active' ? rule.isActive : tab === 'inactive' ? !rule.isActive : origin !== 'GLOBAL').map(({ rule, origin }) => row(rule, origin))}</ul>
          )}
        </CardContent>
      </Card>

      {isPlatformAdmin && (
        <Card className="mt-4">
          <CardContent className="pt-6">
            <p className="mb-2 text-sm font-semibold">{t.globalSection}</p>
            <ul className="divide-y divide-border">{rules.filter((r) => r.firmId === null).map((r) => row(r, null))}</ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
