export function isActionRequest(method?: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes((method ?? 'GET').toUpperCase());
}

export function publishActionFeedback(status: 'success' | 'error', message: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('lawfirm:action-result', { detail: { status, message } }));
}

export function actionSuccessMessage(method?: string): string {
  return method?.toUpperCase() === 'DELETE' ? 'ลบรายการแล้ว' : 'บันทึกรายการแล้ว';
}
