export function isActionRequest(method?: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes((method ?? 'GET').toUpperCase());
}

export function publishActionFeedback(status: 'success' | 'error', message: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('lawfirm:action-result', { detail: { status, message } }));
}

/** +1 when an AI request starts, -1 when it settles; AiWorkingIndicator counts them. */
export function publishAiBusy(delta: 1 | -1) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('lawfirm:ai-busy', { detail: delta }));
}

export function actionSuccessMessage(method?: string): string {
  return method?.toUpperCase() === 'DELETE' ? 'ลบรายการแล้ว' : 'บันทึกรายการแล้ว';
}
