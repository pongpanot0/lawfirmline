import { Button } from '@/components/ui/button';
import { remainingText } from './guide-helpers';

type Item = { label: string; done: boolean; hint?: string };
export function SubmitSummary({ items, loading, label, loadingLabel }: { items: Item[]; loading: boolean; label: string; loadingLabel: string }) {
  const remaining = remainingText(items);
  return <aside data-submit-summary aria-label="เช็กให้ครบก่อนกด" className="fixed inset-x-0 bottom-0 z-[45] border-t bg-card p-3 shadow-lg xl:z-20 xl:sticky xl:top-4 xl:inset-auto xl:self-start xl:rounded-lg xl:border xl:p-4 xl:shadow-none">
    <h2 className="font-semibold">เช็กให้ครบก่อนกด <span className="text-sm font-normal text-muted-foreground">{items.filter(i => i.done).length}/{items.length} สำเร็จ</span></h2>
    <ul className="my-3 hidden space-y-2 text-sm xl:block">{items.map(item => <li key={item.label}><span aria-hidden="true">{item.done ? '✓' : '○'}</span> {item.label}{item.hint && <span className="block pl-5 text-xs text-muted-foreground">{item.hint}</span>}</li>)}</ul>
    <Button type="submit" disabled={!!remaining || loading} className="mt-2 min-h-11 w-full xl:mt-0">{loading ? loadingLabel : label}</Button>
    {remaining && <p className="mt-1 text-xs text-muted-foreground">{remaining}</p>}
  </aside>;
}
