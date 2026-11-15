export type CloseChoice = { action: 'FULL' | 'PARTIAL' | 'WAIVE'; amount: string; reason: string };
export function closeOutItems(milestones: { id: string }[], choices: Record<string, CloseChoice>) {
  return milestones.map(m => {
    const choice = choices[m.id];
    return { milestoneId: m.id, action: choice.action, ...(choice.action === 'PARTIAL' ? { amount: Number(choice.amount) } : {}), ...(choice.action === 'WAIVE' ? { reason: choice.reason.trim() } : {}) };
  });
}
