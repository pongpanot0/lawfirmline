'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, DateSuggestionItem, UserItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { bangkokInputToIso, bangkokInputValue } from '@/lib/bangkok';

type Draft = { label: string; date: string; time: string; eventType: DateSuggestionItem['eventType']; assigneeId: string };

/**
 * Pending date suggestions for one case, awaiting a lawyer's confirmation.
 *
 * Both kinds of suggestion — dates extracted from a document and deadlines
 * derived from a procedural rule — confirm through the same endpoint, but they
 * belong on different screens and explain their origin differently, so the
 * caller picks which `source` it is showing.
 */
export function DateSuggestionsPanel({
  caseId,
  source,
  title,
  reloadKey = 0,
  hideWhenEmpty = true,
}: {
  caseId: string;
  source: DateSuggestionItem['source'];
  title: string;
  /** Bump to reload after something upstream created new suggestions. */
  reloadKey?: number;
  hideWhenEmpty?: boolean;
}) {
  const d = useDashboardT();
  const { token } = useAuth();
  const [suggestions, setSuggestions] = useState<DateSuggestionItem[]>([]);
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!token || !caseId) return;
    api
      .getDateSuggestions(token, caseId, 'PENDING')
      .then((all) => setSuggestions(all.filter((s) => s.source === source)))
      .catch(console.error);
  }, [token, caseId, source]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  useEffect(() => {
    if (!token || source !== 'DOCUMENT') return;
    api.getLawyers(token)
      .then((users) => setLawyers(users.filter((lawyer) => lawyer.firmRole !== 'ASSISTANT')))
      .catch(() => setError('โหลดรายชื่อทนายไม่สำเร็จ กรุณาโหลดหน้าใหม่'));
  }, [token, source]);

  const draftFor = (s: DateSuggestionItem): Draft =>
    drafts[s.id] ?? {
      label: s.label,
      date: bangkokInputValue(s.suggestedDate).slice(0, 10),
      time: bangkokInputValue(s.suggestedDate).slice(11, 16),
      eventType: s.eventType,
      assigneeId: '',
    };

  const confirm = async (s: DateSuggestionItem) => {
    if (!token) return;
    const draft = draftFor(s);
    if (!draft.date || !draft.time) {
      setError('กรุณาตรวจวันและเวลานัด');
      return;
    }
    if (source === 'DOCUMENT' && !lawyers.some((lawyer) => lawyer.id === draft.assigneeId)) {
      setError('กรุณาเลือกทนายผู้รับผิดชอบวันนัด');
      return;
    }
    setBusyId(s.id);
    setError('');
    try {
      await api.confirmDateSuggestion(token, caseId, s.id, {
        expectedUpdatedAt: s.updatedAt,
        label: draft.label,
        date: bangkokInputToIso(`${draft.date}T${draft.time}`),
        eventType: draft.eventType,
        assigneeId: source === 'DOCUMENT' ? draft.assigneeId : undefined,
      });
      setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : d.caseDocuments.extractDatesFailed);
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (s: DateSuggestionItem) => {
    if (!token) return;
    setError('');
    try {
      await api.dismissDateSuggestion(token, caseId, s.id);
      setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : d.caseDocuments.extractDatesFailed);
    }
  };

  if (suggestions.length === 0 && hideWhenEmpty) return null;

  return (
    <div className="mb-6 rounded-xl border bg-card p-6 shadow-soft">
      <h2 className="mb-4 font-semibold text-foreground">{title}</h2>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{d.dateSuggestions.empty}</p>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => {
            const draft = draftFor(s);
            return (
              <div key={s.id} className="rounded-lg border p-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <input
                    type="text"
                    aria-label={d.deadlineRules.label}
                    value={draft.label}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [s.id]: { ...draft, label: e.target.value } }))
                    }
                    className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
                  />
                  <ThaiDateInput
                    value={draft.date}
                    onChange={(v) =>
                      setDrafts((prev) => ({ ...prev, [s.id]: { ...draft, date: v } }))
                    }
                  />
                  <label className="text-xs text-muted-foreground">
                    เวลา (ประเทศไทย)
                    <input
                      type="time"
                      required
                      value={draft.time}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [s.id]: { ...draft, time: e.target.value } }))}
                      className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground"
                    />
                  </label>
                  <select
                    aria-label={d.calendar.typeDeadline}
                    value={draft.eventType}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [s.id]: { ...draft, eventType: e.target.value as Draft['eventType'] },
                      }))
                    }
                    className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
                  >
                    <option value="COURT_DATE">{d.calendar.typeCourtDate}</option>
                    <option value="CLIENT_MEETING">{d.calendar.typeClientMeeting}</option>
                    <option value="DEADLINE">{d.calendar.typeDeadline}</option>
                    <option value="OTHER">{d.calendar.typeOther}</option>
                  </select>
                </div>

                {source === 'DOCUMENT' && (
                  <label className="mt-3 block text-sm font-medium">
                    ทนายผู้รับผิดชอบวันนัด <span className="text-destructive">*</span>
                    <select
                      required
                      value={draft.assigneeId}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [s.id]: { ...draft, assigneeId: e.target.value } }))}
                      className="mt-1 min-h-11 w-full rounded-lg border border-input bg-card px-3 text-sm sm:max-w-sm"
                    >
                      <option value="">เลือกทนายผู้รับผิดชอบ</option>
                      {lawyers.map((lawyer) => (
                        <option key={lawyer.id} value={lawyer.id}>{lawyer.firstName} {lawyer.lastName}</option>
                      ))}
                    </select>
                  </label>
                )}

                {s.source === 'RULE'
                  ? s.deadlineRule && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {d.dateSuggestions.fromRule}:{' '}
                        {d.deadlineRules.triggers[s.deadlineRule.trigger]} → {s.deadlineRule.label}
                      </p>
                    )
                  : s.sourceExcerpt && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {d.caseDocuments.sourceExcerpt}: &ldquo;{s.sourceExcerpt}&rdquo;
                      </p>
                    )}

                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId === s.id}
                    onClick={() => confirm(s)}
                  >
                    {busyId === s.id ? d.caseDocuments.confirming : d.caseDocuments.confirmDate}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === s.id}
                    onClick={() => dismiss(s)}
                  >
                    {d.caseDocuments.dismissDate}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
