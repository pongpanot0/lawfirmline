import type { WorkloadSummary } from './api';

/** Same hint as the case create form's lead-lawyer picker. */
export function workloadLabel(w: Pick<WorkloadSummary, 'leadCount' | 'buddyCount' | 'nearDeadlineCount'> | undefined): string {
  return w ? ` (หลัก ${w.leadCount}, ผู้ช่วย ${w.buddyCount}, ใกล้ deadline ${w.nearDeadlineCount})` : '';
}
