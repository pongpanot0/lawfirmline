'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api, UserItem, CaseTypeItem } from '@/lib/api';
import { Stepper } from '@/components/ui/Stepper';
import type { CaseFieldSchema } from '@lawfirm/shared';

const STEPS = [
  { id: 'type', label: 'Case Type', description: 'ประเภทคดี' },
  { id: 'basic', label: 'Basic Info', description: 'ข้อมูลพื้นฐาน' },
  { id: 'custom', label: 'Details', description: 'รายละเอียดเพิ่มเติม' },
  { id: 'team', label: 'Team', description: 'ทีมงาน' },
];

export default function NewCasePage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  const [clerks, setClerks] = useState<UserItem[]>([]);
  const [caseTypes, setCaseTypes] = useState<CaseTypeItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    caseTypeId: '',
    caseNumber: '',
    title: '',
    clientName: '',
    courtName: '',
    description: '',
    leadLawyerId: user?.id ?? '',
    coCounselIds: [] as string[],
    clerkIds: [] as string[],
    customFields: {} as Record<string, string>,
  });

  const selectedType = caseTypes.find((t) => t.id === form.caseTypeId);
  const fieldSchema = (selectedType?.fieldSchema ?? []) as CaseFieldSchema[];

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api.getLawyers(token),
      api.getUsers(token).catch(() => []),
      api.getCaseTypes(token),
    ]).then(([lawyerList, userList, types]) => {
      setLawyers(lawyerList);
      setClerks(userList.filter((u) => u.role === 'CLERK'));
      setCaseTypes(types);
    });
  }, [token]);

  useEffect(() => {
    if (user?.id && !form.leadLawyerId) {
      setForm((f) => ({ ...f, leadLawyerId: user.id }));
    }
  }, [user, form.leadLawyerId]);

  const toggleMulti = (field: 'coCounselIds' | 'clerkIds', id: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(id)
        ? prev[field].filter((x) => x !== id)
        : [...prev[field], id],
    }));
  };

  const canNext = () => {
    if (step === 0) return !!form.caseTypeId;
    if (step === 1) return form.caseNumber && form.title && form.clientName && form.courtName;
    if (step === 2) {
      return fieldSchema
        .filter((f) => f.required)
        .every((f) => form.customFields[f.key]?.trim());
    }
    if (step === 3) return !!form.leadLawyerId;
    return true;
  };

  const handleSubmit = async () => {
    if (!token) return;
    setSubmitting(true);
    setError('');
    try {
      const created = (await api.createCase(token, {
        caseNumber: form.caseNumber,
        title: form.title,
        description: form.description || undefined,
        clientName: form.clientName,
        courtName: form.courtName,
        leadLawyerId: form.leadLawyerId,
        caseTypeId: form.caseTypeId,
        coCounselIds: form.coCounselIds,
        clerkIds: form.clerkIds,
        customFields: Object.keys(form.customFields).length ? form.customFields : undefined,
      })) as { id: string };
      router.push(`/cases/${created.id}`);
    } catch {
      setError('Failed to create case. Check case number is unique.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Create New Case</h1>
      <p className="mb-6 text-sm text-slate-500">Multi-step case intake with auto-generated folder ID</p>

      <Stepper steps={STEPS} currentStep={step} onStepClick={(i) => i < step && setStep(i)} />

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {step === 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold">Select Case Type / เลือกประเภทคดี</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {caseTypes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setForm({ ...form, caseTypeId: t.id, customFields: {} })}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    form.caseTypeId === t.id
                      ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
                      : 'border-slate-200 hover:border-brand-300'
                  }`}
                >
                  <p className="font-medium">{t.name}</p>
                  {t.description && (
                    <p className="mt-1 text-xs text-slate-500">{t.description}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold">Basic Information</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700">Case Number *</label>
              <input
                required
                value={form.caseNumber}
                onChange={(e) => setForm({ ...form, caseNumber: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="LF-2025-006"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Title *</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Client Name *</label>
              <input
                required
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Court Name / ศาล *</label>
              <input
                required
                value={form.courtName}
                onChange={(e) => setForm({ ...form, courtName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="ศาลแพ่งกรุงเทพใต้"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold">
              {selectedType?.name} — Specific Fields
            </h2>
            {fieldSchema.length === 0 ? (
              <p className="text-sm text-slate-500">No additional fields for this case type.</p>
            ) : (
              fieldSchema.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-slate-700">
                    {field.label}{field.required ? ' *' : ''}
                  </label>
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    required={field.required}
                    value={form.customFields[field.key] ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        customFields: { ...form.customFields, [field.key]: e.target.value },
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              ))
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-semibold">Assign Team</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700">Lead Lawyer *</label>
              <select
                required
                value={form.leadLawyerId}
                onChange={(e) => setForm({ ...form, leadLawyerId: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select lead lawyer</option>
                {lawyers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.firstName} {l.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Co-Counsel</label>
              <div className="mt-2 space-y-2">
                {lawyers
                  .filter((l) => l.id !== form.leadLawyerId)
                  .map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.coCounselIds.includes(l.id)}
                        onChange={() => toggleMulti('coCounselIds', l.id)}
                      />
                      {l.firstName} {l.lastName}
                    </label>
                  ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Clerks</label>
              <div className="mt-2 space-y-2">
                {clerks.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.clerkIds.includes(c.id)}
                      onChange={() => toggleMulti('clerkIds', c.id)}
                    />
                    {c.firstName} {c.lastName}
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium">Summary</p>
              <p className="mt-1">{form.title} — {form.clientName}</p>
              <p className="text-xs text-slate-400">Court: {form.courtName}</p>
              <p className="mt-1 text-xs text-brand-600">Folder ID will be auto-generated on create</p>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <div className="mt-6 flex justify-between">
          <button
            type="button"
            onClick={() => (step > 0 ? setStep(step - 1) : router.back())}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              disabled={!canNext()}
              onClick={() => setStep(step + 1)}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting || !canNext()}
              onClick={handleSubmit}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Case'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
