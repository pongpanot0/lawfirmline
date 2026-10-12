'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
import { InlineEmptyState } from '@/components/ui/misc';

const SELECT = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm';

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

  const load = () => {
    if (token) api.getDeadlineRules(token).then(setRules).catch(console.error);
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

  /** `viaOverride`: a global rule seen from the firm table is switched by an override, never edited in place. */
  const toggle = (rule: DeadlineRuleItem, viaOverride: boolean) =>
    run(() =>
      viaOverride
        ? api.createDeadlineRule(token!, payload(fromRule(rule, { isActive: !rule.isActive })))
        : api.updateDeadlineRule(token!, rule.id, { isActive: !rule.isActive }),
    );

  const remove = (rule: DeadlineRuleItem) => {
    if (window.confirm(t.confirmDelete)) run(() => api.deleteDeadlineRule(token!, rule.id));
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
    <li key={rule.id} className="flex flex-wrap items-center gap-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          {rule.label}
          {origin && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{t.origin[origin]}</span>}
        </p>
        <p className="text-xs text-muted-foreground">{describe(rule)}</p>
      </div>
      {fromGlobal && (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setForm(fromRule(rule))}>{t.customize}</Button>
      )}
      <Button type="button" size="sm" variant={rule.isActive ? 'secondary' : 'outline'} disabled={busy} onClick={() => toggle(rule, fromGlobal)}>
        {fromGlobal ? (rule.isActive ? t.disableForFirm : t.enableForFirm) : rule.isActive ? t.active : t.inactive}
      </Button>
      {rule.canEdit && !fromGlobal && (
        <Button type="button" size="sm" variant="ghost" disabled={busy} aria-label={origin === 'OVERRIDE' ? t.revert : t.confirmDelete} onClick={() => remove(rule)}>
          {origin === 'OVERRIDE' ? t.revert : <Trash2 className="size-4" />}
        </Button>
      )}
    </li>
    );
  };

  const field = (label: string, input: React.ReactNode, wide = false) => (
    <label className={`text-sm ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-muted-foreground">{label}</span>
      {input}
    </label>
  );

  return (
    <div>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <Button size="sm" onClick={() => setForm(form ? null : EMPTY)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            {t.add}
          </Button>
        }
      />

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

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
                <select className={SELECT} disabled={form.lockLabel} value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value as DeadlineTrigger })}>
                  {Object.values(DeadlineTrigger).map((x) => <option key={x} value={x}>{t.triggers[x]}</option>)}
                </select>
              ))}
              {field(`${t.offsetDays} — ${t.offsetHint}`, (
                <Input type="number" min={-3650} max={3650} required value={form.offsetDays} onChange={(e) => setForm({ ...form, offsetDays: Number(e.target.value) })} />
              ))}
              {field(t.dayBasis, (
                <select className={SELECT} value={form.dayBasis} onChange={(e) => setForm({ ...form, dayBasis: e.target.value as DeadlineDayBasis })}>
                  {Object.values(DeadlineDayBasis).map((x) => <option key={x} value={x}>{t.bases[x]}</option>)}
                </select>
              ))}
              {field(t.adjustDays, (
                <Input type="number" min={-3650} max={3650} value={form.adjustDays} onChange={(e) => setForm({ ...form, adjustDays: Number(e.target.value) })} />
              ))}
              {field(t.partySide, (
                <select className={SELECT} value={form.partySide} onChange={(e) => setForm({ ...form, partySide: e.target.value as PartyRole | '' })}>
                  <option value="">{t.any}</option>
                  {Object.values(PartyRole).map((x) => <option key={x} value={x}>{PARTY_ROLE_LABELS[x]}</option>)}
                </select>
              ))}
              {form.trigger === DeadlineTrigger.COURT_DATE && field(t.courtEventKind, (
                <select className={SELECT} value={form.courtEventKind} onChange={(e) => setForm({ ...form, courtEventKind: e.target.value as CourtEventKind | '' })}>
                  <option value="">{t.any}</option>
                  {Object.values(CourtEventKind).map((x) => <option key={x} value={x}>{COURT_EVENT_KIND_LABELS[x]}</option>)}
                </select>
              ))}
              {form.trigger === DeadlineTrigger.JUDGMENT && field(t.courtLevel, (
                <select className={SELECT} value={form.courtLevel} onChange={(e) => setForm({ ...form, courtLevel: e.target.value as CourtLevel | '' })}>
                  <option value="">{t.any}</option>
                  {Object.values(CourtLevel).map((x) => <option key={x} value={x}>{COURT_LEVEL_LABELS[x]}</option>)}
                </select>
              ))}
              {form.trigger === DeadlineTrigger.COMPLAINT_SERVED && field(t.serviceMethod, (
                <select className={SELECT} value={form.serviceMethod} onChange={(e) => setForm({ ...form, serviceMethod: e.target.value as ServiceMethod | '' })}>
                  <option value="">{t.any}</option>
                  {Object.values(ServiceMethod).map((x) => <option key={x} value={x}>{SERVICE_METHOD_LABELS[x]}</option>)}
                </select>
              ))}
              {isPlatformAdmin && !form.lockLabel && (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={form.global} onChange={(e) => setForm({ ...form, global: e.target.checked })} />
                  {t.global}
                </label>
              )}
              <div className="sm:col-span-2">
                <Button type="submit" size="sm" disabled={busy}>{t.save}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          {rows.length === 0 ? (
            <InlineEmptyState title={t.empty} description="เพิ่มกฎแรกเพื่อให้ระบบช่วยคำนวณกำหนดตามเหตุการณ์ของคดี" />
          ) : (
            <ul className="divide-y divide-border">{rows.map(({ rule, origin }) => row(rule, origin))}</ul>
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
