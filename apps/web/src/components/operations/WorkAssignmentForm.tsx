'use client';

import { useEffect, useState } from 'react';
import { canAssignFirmRole, DailyWorkboard, DailyWorkTask, FirmRole, HEAVY_QUEUE_POINTS, TASK_SIZES, TASK_WORK_TYPES, TaskPriority, TaskSize, TaskWorkType, taskPoints } from '@lawfirm/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bangkokInputToIso } from '@/lib/bangkok';
import { formatDateTime } from '@/lib/utils';
import { assignmentCandidates } from '@/lib/daily-workboard';
import { TextField, TextareaField, SelectField, DateField, DateTimeField } from '@/components/ui/form-fields';
import { Button } from '@/components/ui/button';

export function WorkAssignmentForm({ board, task, token, onSaved, onClose, onSaving }: {
  board: DailyWorkboard; task?: DailyWorkTask; token: string; onSaved: () => void; onClose: () => void; onSaving: (saving: boolean) => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState('');
  const [workType, setWorkType] = useState(task?.workType ?? TaskWorkType.GENERAL);
  const [caseId, setCaseId] = useState(task?.caseId ?? '');
  const [size, setSize] = useState(task?.size ?? TaskSize.M);
  const [assigneeId, setAssigneeId] = useState('');
  const [scheduledFor, setScheduledFor] = useState(board.date);
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState(TaskPriority.MEDIUM);
  const [review, setReview] = useState('NO');
  const [reviewerId, setReviewerId] = useState('');
  const [placeFirst, setPlaceFirst] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [availability, setAvailability] = useState(board);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const assignmentDate = task ? board.date : scheduledFor;
  useEffect(() => {
    let cancelled = false;
    setConfirmed(false); setAvailabilityError('');
    if (assignmentDate === board.date) { setAvailability(board); setAvailabilityLoading(false); return; }
    if (!assignmentDate) { setAvailabilityError('เลือกวันที่วางแผนทำงาน'); return; }
    setAvailabilityLoading(true);
    api.getDailyWorkboard(token, assignmentDate).then((data) => { if (!cancelled) setAvailability(data); })
      .catch(() => { if (!cancelled) setAvailabilityError('ตรวจวันลาและนัดหมายไม่ได้ กรุณาลองอีกครั้ง'); })
      .finally(() => { if (!cancelled) setAvailabilityLoading(false); });
    return () => { cancelled = true; };
  }, [assignmentDate, board, token]);
  const candidates = assignmentCandidates(availability.members.filter((m) => user && (m.userId === user.id || canAssignFirmRole(user.firmRole, m.role as FirmRole))), availability.tasks.filter((t) => t.id !== task?.id), workType, assignmentDate);
  const selected = candidates.find((c) => c.member.userId === assigneeId);
  const risks = selected ? [selected.member.onLeave && 'มีวันลาที่อนุมัติแล้ว', !selected.configured && 'ยังไม่ได้กำหนดให้ทำงานประเภทนี้', selected.unknown && 'ความคืบหน้าของงานเดิมยังไม่ครบ', selected.member.appointments.length > 0 && 'มีนัดหมายในวันที่เลือก', placeFirst && selected.queue.length > 0 && 'งานเดิมถูกเลื่อนลำดับ', selected.points + taskPoints(size) > HEAVY_QUEUE_POINTS && `คิวรวมจะเป็น ${selected.points + taskPoints(size)} แต้ม (เกิน ${HEAVY_QUEUE_POINTS})`].filter(Boolean) : [];

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || availabilityLoading || availabilityError || (risks.length > 0 && !confirmed)) return;
    setBusy(true); onSaving(true); setError('');
    try {
      if (task) {
        await api.assignDailyTask(token, task.id, { assigneeId, placeFirst, size });
      } else {
        await api.createDailyTask(token, {
          title: title.trim(), description: description.trim() || undefined, workType, size, caseId: caseId || undefined,
          assigneeId: assigneeId || undefined, scheduledFor, dueDate: due ? bangkokInputToIso(due) : undefined,
          priority, requiresReview: review === 'YES', reviewerId: review === 'YES' ? reviewerId : undefined, placeFirst,
        });
      }
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'บันทึกไม่ได้ กรุณาลองอีกครั้ง'); }
    finally { setBusy(false); onSaving(false); }
  };

  return <form onSubmit={save} className="space-y-5 p-5">
    <fieldset disabled={busy} className="space-y-4">
      {task ? <p className="font-semibold">{task.title}</p> : <>
        <TextField label="ชื่องาน" value={title} required maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ถอดเทปคำให้การพยาน" />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="ประเภทงาน" value={workType} onChange={(e) => { setWorkType(e.target.value as TaskWorkType); setConfirmed(false); }}>
            {TASK_WORK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </SelectField>
          <SelectField label="คดีที่เกี่ยวข้อง" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
            <option value="">งานสำนักงาน / ยังไม่มีคดี</option>
            {board.cases.map((c) => <option key={c.id} value={c.id}>{c.ownRef} · {c.title}</option>)}
          </SelectField>
        </div>
        <TextareaField label="รายละเอียด / ผลงานที่ต้องส่ง" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField label="วางแผนทำวันที่" required value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
          <DateTimeField label="กำหนดส่ง (ถ้ามี)" value={due} onChange={(e) => setDue(e.target.value)} hint="เวลาไทย · ไม่ใช้กำหนดส่งเพื่อคำนวณชั่วโมงว่าง" />
        </div>
      </>}
      <SelectField label="ขนาดงาน" value={size} onChange={(e) => { setSize(e.target.value as TaskSize); setConfirmed(false); }} hint="ใช้คิดแต้มภาระงาน: เล็ก 1 · กลาง 2 · ใหญ่ 4">
        {TASK_SIZES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </SelectField>
      <SelectField label="ผู้รับผิดชอบ" required={!!task} value={assigneeId} onChange={(e) => { setAssigneeId(e.target.value); setConfirmed(false); }} hint="เรียงจากประเภทงานที่กำหนดไว้ วันลา และข้อมูลความคืบหน้า">
        <option value="">{task ? 'เลือกผู้รับผิดชอบ' : 'ยังไม่มอบหมาย'}</option>
        {candidates.map(({ member, queue, points, configured, reviews }) => <option key={member.userId} value={member.userId}>
          {member.firstName} {member.lastName} · {member.onLeave ? 'ลางาน' : configured ? 'ตรงประเภทงาน' : 'ยังไม่กำหนดประเภท'} · คิว {queue.length} งาน ({points} แต้ม){reviews.length > 0 ? ` · รอตรวจ ${reviews.length}` : ''}
        </option>)}
      </SelectField>
      {selected && <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <p className="font-medium">งานเดิมของ {selected.member.firstName} · {selected.points} แต้ม</p>
        {selected.reviews.length > 0 && <p className="mt-1 text-amber-700">ยังมีงานรอตรวจ {selected.reviews.length} งาน: {selected.reviews.map((t) => t.title).join(', ')}</p>}
        {selected.queue.length === 0 ? <p className="mt-1 text-muted-foreground">ยังไม่มีงานในคิวที่บันทึกไว้ ต้องยืนยันความพร้อมกับผู้รับผิดชอบ</p> : <ol className="mt-2 space-y-1">
          {selected.queue.map((t, i) => <li key={t.id} className="flex gap-2"><span className="text-muted-foreground">{placeFirst ? i + 2 : i + 1}.</span><span>{t.title}{t.dueDate && <span className="block text-xs text-muted-foreground">ส่ง {formatDateTime(t.dueDate)}</span>}</span></li>)}
        </ol>}
        {placeFirst && selected.queue.length > 0 && <p className="mt-2 text-amber-700">งานใหม่ขึ้นลำดับ 1 งานเดิมขยับลง กำหนดส่งยังคงเดิม</p>}
      </div>}
      {assigneeId && <SelectField label="ตำแหน่งในคิว" value={placeFirst ? 'FIRST' : 'LAST'} onChange={(e) => { setPlaceFirst(e.target.value === 'FIRST'); setConfirmed(false); }}>
        <option value="LAST">ต่อท้ายงานเดิม</option><option value="FIRST">แทรกเป็นงานแรก</option>
      </SelectField>}
      {!task && <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="ความสำคัญ" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
          <option value="HIGH">สูง</option><option value="MEDIUM">ปกติ</option><option value="LOW">ต่ำ</option>
        </SelectField>
        <SelectField label="ตรวจงานก่อนเสร็จ" value={review} onChange={(e) => setReview(e.target.value)}>
          <option value="NO">เสร็จเมื่อส่งผลงาน</option><option value="YES">ต้องมีผู้ตรวจ</option>
        </SelectField>
      </div>}
      {!task && review === 'YES' && <SelectField label="ผู้ตรวจ" required value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}>
        <option value="">เลือก Owner / ทนายอาวุโส</option>
        {board.members.filter((m) => ['OWNER', 'SENIOR_LAWYER'].includes(m.role) && m.userId !== assigneeId).map((m) => <option key={m.userId} value={m.userId}>{m.firstName} {m.lastName}</option>)}
      </SelectField>}
      {risks.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-medium">ตรวจสอบก่อนมอบหมาย</p><ul className="mt-1 list-inside list-disc">{risks.map((r) => <li key={String(r)}>{r}</li>)}</ul>
        <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />รับทราบข้อมูลและยืนยันการจัดงานนี้</label>
      </div>}
    </fieldset>
    {availabilityLoading && <p role="status" className="text-sm text-muted-foreground">กำลังตรวจวันลาและนัดหมาย…</p>}
    {(error || availabilityError) && <p role="alert" className="text-sm text-destructive">{error || availabilityError}</p>}
    <div className="flex gap-2 border-t pt-4"><Button type="submit" disabled={busy || availabilityLoading || !!availabilityError || (risks.length > 0 && !confirmed)}>{busy ? 'กำลังบันทึก…' : task ? 'มอบหมายงาน' : 'สร้างงาน'}</Button><Button type="button" variant="outline" disabled={busy} onClick={onClose}>ยกเลิก</Button></div>
  </form>;
}
