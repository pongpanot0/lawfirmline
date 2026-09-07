'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { DeadlineDayBasis, DeadlineTrigger, FirmRole } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CaseTypeItem, DeadlineRuleItem } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardT } from '@/components/landing/LocaleProvider';

const TRIGGERS = Object.values(DeadlineTrigger);
const BASES = Object.values(DeadlineDayBasis);

const EMPTY_FORM = {
  label: '',
  trigger: DeadlineTrigger.COURT_DATE as DeadlineTrigger,
  offsetDays: 30,
  dayBasis: DeadlineDayBasis.CALENDAR as DeadlineDayBasis,
  caseTypeId: '',
};

export default function DeadlineRulesPage() {
  const { token, user } = useAuth();
  const d = useDashboardT();
  const [rules, setRules] = useState<DeadlineRuleItem[]>([]);
  const [caseTypes, setCaseTypes] = useState<CaseTypeItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  const load = () => {
    if (!token) return;
    api.getDeadlineRules(token).then(setRules).catch(console.error);
  };

  useEffect(() => {
    load();
    if (token) api.getCaseTypes(token, true).then(setCaseTypes).catch(console.error);
  }, [token]);

  if (user?.firmRole !== FirmRole.OWNER) {
    return <p className="text-destructive">Access denied. Admin only. / ไม่มีสิทธิ์เข้าถึง เฉพาะ Admin</p>;
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    try {
      await api.createDeadlineRule(token, {
        label: form.label,
        trigger: form.trigger,
        offsetDays: Number(form.offsetDays),
        dayBasis: form.dayBasis,
        ...(form.caseTypeId ? { caseTypeId: form.caseTypeId } : {}),
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : d.deadlineRules.saveFailed);
    }
  };

  const handleToggle = async (rule: DeadlineRuleItem) => {
    if (!token) return;
    setError('');
    try {
      await api.updateDeadlineRule(token, rule.id, { isActive: !rule.isActive });
      load();
    } catch {
      setError(d.deadlineRules.saveFailed);
    }
  };

  const handleDelete = async (rule: DeadlineRuleItem) => {
    if (!token || !window.confirm(d.deadlineRules.confirmDelete)) return;
    setError('');
    try {
      await api.deleteDeadlineRule(token, rule.id);
      load();
    } catch {
      setError(d.deadlineRules.saveFailed);
    }
  };

  return (
    <div>
      <PageHeader
        title={d.deadlineRules.title}
        description={d.deadlineRules.description}
        actions={
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            {d.deadlineRules.add}
          </Button>
        }
      />

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {showForm && (
        <Card className="mb-4">
          <CardContent className="pt-6">
            <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">{d.deadlineRules.label}</span>
                <Input
                  required
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">{d.deadlineRules.trigger}</span>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.trigger}
                  onChange={(e) => setForm({ ...form, trigger: e.target.value as DeadlineTrigger })}
                >
                  {TRIGGERS.map((trigger) => (
                    <option key={trigger} value={trigger}>
                      {d.deadlineRules.triggers[trigger]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">
                  {d.deadlineRules.offsetDays}
                </span>
                <Input
                  type="number"
                  min={0}
                  max={3650}
                  required
                  value={form.offsetDays}
                  onChange={(e) => setForm({ ...form, offsetDays: Number(e.target.value) })}
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">{d.deadlineRules.dayBasis}</span>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.dayBasis}
                  onChange={(e) =>
                    setForm({ ...form, dayBasis: e.target.value as DeadlineDayBasis })
                  }
                >
                  {BASES.map((basis) => (
                    <option key={basis} value={basis}>
                      {d.deadlineRules.bases[basis]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-muted-foreground">{d.deadlineRules.caseType}</span>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.caseTypeId}
                  onChange={(e) => setForm({ ...form, caseTypeId: e.target.value })}
                >
                  <option value="">{d.deadlineRules.allCaseTypes}</option>
                  {caseTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="sm:col-span-2">
                <Button type="submit" size="sm">
                  {d.deadlineRules.add}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">{d.deadlineRules.empty}</p>
          ) : (
            <ul className="divide-y divide-border">
              {rules.map((rule) => (
                <li key={rule.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{rule.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.deadlineRules.triggers[rule.trigger]} + {rule.offsetDays}{' '}
                      {d.deadlineRules.bases[rule.dayBasis]}
                      {rule.caseTypeId
                        ? ` · ${caseTypes.find((t) => t.id === rule.caseTypeId)?.name ?? ''}`
                        : ` · ${d.deadlineRules.allCaseTypes}`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={rule.isActive ? 'secondary' : 'outline'}
                    onClick={() => handleToggle(rule)}
                  >
                    {rule.isActive ? d.deadlineRules.active : d.deadlineRules.inactive}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={d.deadlineRules.confirmDelete}
                    onClick={() => handleDelete(rule)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
