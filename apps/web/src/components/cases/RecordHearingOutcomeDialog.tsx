'use client';

import { useEffect, useMemo, useState } from 'react';
import { ActivityType, EXPENSE_CATEGORIES, EventType, ExpenseStatus } from '@lawfirm/shared';
import { api, CalendarEventItem, CaseDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bangkokInputToIso, bangkokInputValue } from '@/lib/bangkok';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/misc';
import { formatDateTime } from '@/lib/utils';

const SELECT_CLASS = 'w-full h-9 rounded-lg border border-input bg-card px-3 text-sm';

/** One thing the lawyer chose to record, and how it went. */
type StepKey = 'activity' | 'nextHearing' | 'task' | 'expense';
type StepState = 'idle' | 'saving' | 'done' | 'failed';

const STEP_LABELS: Record<StepKey, string> = {
  activity: 'บันทึกความเคลื่อนไหวของคดี',
  nextHearing: 'นัดครั้งหน้า',
  task: 'งานที่ต้องทำต่อ',
  expense: 'ร่างค่าใช้จ่าย (ยังไม่ส่งเบิก)',
};

export interface RecordHearingOutcomeDialogProps {
  legalCase: CaseDetail;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Everything a lawyer records after coming back from court, once.
 *
 * The hearing they attended is already on the case, so the case, the court and
 * the team are taken from it rather than asked for again. What the lawyer adds
 * is the outcome; the rest — the case activity, the next hearing, the follow-up
 * task, the travel cost — is proposed for them to tick, edit and save together.
 *
 * Each tick is saved separately and reports its own result, so a failure part
 * way leaves the successful ones recorded and the retry covers only what did
 * not land. The cost is saved as a draft: recording what a trip cost is not the
 * same act as claiming it back.
 */
export function RecordHearingOutcomeDialog({
  legalCase,
  onClose,
  onSaved,
}: RecordHearingOutcomeDialogProps) {
  const { token } = useAuth();

  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState('');

  // The case detail carries only its first ten events, which on a long-running
  // case are all old — the hearing just attended has to be looked up directly.
  useEffect(() => {
    if (!token) return;
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    setLoadingEvents(true);
    setEventsError('');
    api
      .getCalendarEvents(token, { from, to })
      .then((all) => setEvents(all.filter((event) => event.case?.id === legalCase.id)))
      .catch(() => setEventsError('โหลดรายการนัดไม่สำเร็จ'))
      .finally(() => setLoadingEvents(false));
  }, [token, legalCase.id]);

  const pastHearings = useMemo(
    () =>
      [...events].sort(
        (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime(),
      ),
    [events],
  );

  const [eventId, setEventId] = useState('');
  useEffect(() => {
    // Preselect the hearing they most likely just came back from, without
    // overriding a pick they already made.
    setEventId((current) => current || pastHearings[0]?.id || '');
  }, [pastHearings]);
  const hearing = pastHearings.find((event) => event.id === eventId);

  const [outcome, setOutcome] = useState('');
  const [selected, setSelected] = useState<Record<StepKey, boolean>>({
    activity: true,
    nextHearing: false,
    task: false,
    expense: false,
  });
  const [results, setResults] = useState<Partial<Record<StepKey, StepState>>>({});
  const [errors, setErrors] = useState<Partial<Record<StepKey, string>>>({});
  const [saving, setSaving] = useState(false);

  const [nextHearingAt, setNextHearingAt] = useState('');
  const [nextHearingTitle, setNextHearingTitle] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [travelNote, setTravelNote] = useState('');

  const courtName = hearing?.courtName ?? legalCase.courtName ?? '';

  useEffect(() => {
    if (!hearing) return;
    setNextHearingTitle(`นัดต่อเนื่อง — ${hearing.title}`);
    setTaskTitle(`ติดตามผลหลัง${hearing.title}`);
  }, [hearing]);

  // The travel estimate is a starting figure the lawyer overwrites with what
  // the trip actually cost; a failure to reach the estimator is not an error
  // worth blocking on.
  useEffect(() => {
    if (!token || !selected.expense || !courtName || expenseAmount) return;
    let active = true;
    api
      .calculateTravel(token, courtName)
      .then((travel) => {
        if (!active) return;
        const km = (travel.distanceMeters / 1000).toFixed(1);
        setTravelNote(`ระยะทางโดยประมาณ ${km} กม. จากสำนักงาน — แก้เป็นยอดจริงได้`);
      })
      .catch(() => {
        if (active) setTravelNote('คำนวณระยะทางไม่สำเร็จ — กรอกยอดจริงได้เลย');
      });
    return () => {
      active = false;
    };
  }, [token, selected.expense, courtName, expenseAmount]);

  const toggle = (key: StepKey) =>
    setSelected((previous) => ({ ...previous, [key]: !previous[key] }));

  const runStep = async (key: StepKey, run: () => Promise<unknown>) => {
    setResults((previous) => ({ ...previous, [key]: 'saving' }));
    try {
      await run();
      setResults((previous) => ({ ...previous, [key]: 'done' }));
      setErrors((previous) => ({ ...previous, [key]: undefined }));
    } catch (err) {
      setResults((previous) => ({ ...previous, [key]: 'failed' }));
      setErrors((previous) => ({
        ...previous,
        [key]: err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ',
      }));
    }
  };

  const handleSave = async () => {
    if (!token || !hearing || saving) return;
    setSaving(true);

    // Anything already recorded is skipped, so pressing save again after a
    // partial failure cannot record the same thing twice.
    const pending = (key: StepKey) => selected[key] && results[key] !== 'done';

    if (pending('activity')) {
      await runStep('activity', () =>
        api.createCaseActivity(token, legalCase.id, {
          title: `ผลนัด: ${hearing.title}`,
          description: outcome || undefined,
          activityAt: hearing.startAt,
          type: ActivityType.COURT_DATE,
        }),
      );
    }

    if (pending('nextHearing')) {
      await runStep('nextHearing', () =>
        api.createCalendarEvent(token, {
          caseId: legalCase.id,
          title: nextHearingTitle,
          courtName: courtName || undefined,
          startAt: bangkokInputToIso(nextHearingAt),
          type: EventType.COURT_DATE,
        }),
      );
    }

    if (pending('task')) {
      await runStep('task', () =>
        api.createTask(token, legalCase.id, {
          title: taskTitle,
          dueDate: taskDueDate || undefined,
        }),
      );
    }

    if (pending('expense')) {
      await runStep('expense', () =>
        api.createExpense(token, legalCase.id, {
          amount: Number(expenseAmount),
          description: `ค่าเดินทางไปศาล — ${hearing.title}`,
          category: expenseCategory,
          expensePurpose: courtName || undefined,
          date: hearing.startAt,
          sourceEventId: hearing.id,
          // A record of what the trip cost, not a claim for it.
          status: ExpenseStatus.DRAFT,
        }),
      );
    }

    setSaving(false);
    onSaved();
  };

  const chosen = (Object.keys(selected) as StepKey[]).filter((key) => selected[key]);
  const anyFailed = chosen.some((key) => results[key] === 'failed');
  const allDone = chosen.length > 0 && chosen.every((key) => results[key] === 'done');

  const canSave =
    !!hearing &&
    chosen.length > 0 &&
    (!selected.nextHearing || !!nextHearingAt) &&
    (!selected.task || !!taskTitle.trim()) &&
    (!selected.expense || Number(expenseAmount) > 0);

  return (
    <Modal open onClose={onClose} className="max-w-lg">
      <h2 className="text-lg font-semibold">บันทึกผลหลังขึ้นศาล</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        เลือกนัดที่เพิ่งไปมา แล้วเลือกว่าจะบันทึกอะไรบ้าง — คดี ศาล และทีมมาจากนัดนั้นแล้ว
      </p>

      {loadingEvents ? (
        <p className="mt-4 text-sm text-muted-foreground">กำลังโหลดรายการนัด...</p>
      ) : eventsError ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {eventsError}
        </p>
      ) : pastHearings.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          คดีนี้ยังไม่มีนัดที่ผ่านมาแล้ว — เพิ่มนัดในปฏิทินคดีก่อน
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">นัดที่ไปมา</span>
            <select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className={SELECT_CLASS}
            >
              {pastHearings.map((event) => (
                <option key={event.id} value={event.id}>
                  {formatDateTime(event.startAt)} — {event.title}
                </option>
              ))}
            </select>
            {courtName && (
              <span className="mt-1 block text-xs text-muted-foreground">ศาล: {courtName}</span>
            )}
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">ผลของนัด</span>
            <textarea
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm"
              placeholder="ศาลสั่งอะไร เลื่อนไปวันไหน ต้องทำอะไรต่อ"
            />
          </label>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">บันทึกอะไรบ้าง</legend>

            {(Object.keys(STEP_LABELS) as StepKey[]).map((key) => (
              <div key={key} className="rounded-lg border border-border p-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected[key]}
                    disabled={results[key] === 'done'}
                    onChange={() => toggle(key)}
                  />
                  <span className="flex-1">{STEP_LABELS[key]}</span>
                  {results[key] === 'done' && (
                    <span className="text-xs text-emerald-600">บันทึกแล้ว</span>
                  )}
                  {results[key] === 'saving' && (
                    <span className="text-xs text-muted-foreground">กำลังบันทึก…</span>
                  )}
                  {results[key] === 'failed' && (
                    <span className="text-xs text-destructive">ไม่สำเร็จ</span>
                  )}
                </label>

                {errors[key] && (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {errors[key]}
                  </p>
                )}

                {key === 'nextHearing' && selected.nextHearing && (
                  <div className="mt-2 space-y-2">
                    <Input
                      value={nextHearingTitle}
                      onChange={(e) => setNextHearingTitle(e.target.value)}
                      placeholder="ชื่อนัด"
                    />
                    <Input
                      type="datetime-local"
                      value={nextHearingAt}
                      onChange={(e) => setNextHearingAt(e.target.value)}
                      min={hearing ? bangkokInputValue(hearing.startAt) : undefined}
                    />
                    <p className="text-xs text-muted-foreground">เวลาไทย (Asia/Bangkok)</p>
                  </div>
                )}

                {key === 'task' && selected.task && (
                  <div className="mt-2 space-y-2">
                    <Input
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="ชื่องาน"
                    />
                    <Input
                      type="date"
                      aria-label="ครบกำหนด"
                      value={taskDueDate}
                      onChange={(e) => setTaskDueDate(e.target.value)}
                    />
                  </div>
                )}

                {key === 'expense' && selected.expense && (
                  <div className="mt-2 space-y-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      placeholder="ยอดจริงที่จ่าย (บาท)"
                    />
                    <select
                      aria-label="ประเภทค่าใช้จ่าย"
                      value={expenseCategory}
                      onChange={(e) => setExpenseCategory(e.target.value)}
                      className={SELECT_CLASS}
                    >
                      {EXPENSE_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    {travelNote && (
                      <p className="text-xs text-muted-foreground">{travelNote}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      บันทึกเป็นร่าง — ยังไม่ส่งขออนุมัติและยังไม่จ่าย ส่งเบิกได้ที่หน้าค่าใช้จ่าย
                    </p>
                  </div>
                )}
              </div>
            ))}
          </fieldset>

          {anyFailed && (
            <p className="text-sm text-destructive">
              บางรายการไม่สำเร็จ — รายการที่บันทึกแล้วยังอยู่ กดบันทึกอีกครั้งเพื่อลองเฉพาะที่เหลือ
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {!allDone && (
          <Button type="button" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'กำลังบันทึก...' : anyFailed ? 'ลองอีกครั้งเฉพาะที่เหลือ' : 'บันทึกที่เลือก'}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          {allDone ? 'เสร็จสิ้น' : 'ปิด'}
        </Button>
      </div>
    </Modal>
  );
}
