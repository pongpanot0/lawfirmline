import { Bug, CircleHelp, Lightbulb, type LucideIcon } from 'lucide-react';
import type { FeedbackKind } from '@/lib/api';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { EmptyState, Skeleton } from '@/components/ui/misc';

export const control =
  'rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
export const labels: Record<FeedbackKind, string> = {
  BUG: 'แจ้งปัญหา',
  SUGGESTION: 'เสนอแนะ',
  OTHER: 'อื่นๆ',
  RATING: 'คะแนน',
};
export const faces = ['😞', '😐', '😊'];
/** One source for the bar segments and the legend under them, so the two never drift apart. */
export const RATING_LEGEND = [
  ['bg-red-600', '😞 ใช้ยาก'],
  ['bg-slate-500', '😐 พอใช้'],
  ['bg-primary', '😊 ใช้ง่าย'],
] as const;

const PLATFORM_LABEL: Record<string, string> = { web: 'Web', ios: 'iOS', android: 'Android', LINE: 'LINE' };
/** LINE answers have no platform; their source is the channel. */
export const platformLabel = (platform: string | null, source: string) =>
  PLATFORM_LABEL[platform ?? source] ?? platform ?? source;

const KIND_STYLE: Record<Exclude<FeedbackKind, 'RATING'>, { icon: LucideIcon; className: string }> = {
  BUG: { icon: Bug, className: 'border-destructive/30 bg-destructive/10 text-destructive' },
  SUGGESTION: { icon: Lightbulb, className: 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  OTHER: { icon: CircleHelp, className: 'border-border bg-muted text-foreground' },
};

export function KindBadge({ kind, rating }: { kind: FeedbackKind; rating: number | null }) {
  const base = 'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium';
  if (kind === 'RATING') {
    const label = ['ใช้ยาก', 'พอใช้', 'ใช้ง่าย'][(rating ?? 2) - 1];
    return <span className={`${base} border-border bg-muted`}>{faces[(rating ?? 2) - 1]} {label}</span>;
  }
  const { icon: Icon, className } = KIND_STYLE[kind];
  return (
    <span className={`${base} ${className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {labels[kind]}
    </span>
  );
}
export function State({
  loading,
  error,
  retry,
  empty,
  children,
}: {
  loading: boolean;
  error: boolean;
  retry: () => void;
  empty: boolean;
  children: React.ReactNode;
}) {
  if (loading)
    return (
      <div role="status" className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  if (error) return <LoadFailed onRetry={retry} />;
  if (empty) return <EmptyState title="ยังไม่มีรายการ" />;
  return <>{children}</>;
}
export function Scores({ bad, ok, good }: { bad: number; ok: number; good: number }) {
  const total = bad + ok + good;
  const values = [bad, ok, good];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex h-2 w-36 overflow-hidden rounded bg-muted">
        {values.map((v, i) => (
          <span
            key={i}
            className={RATING_LEGEND[i][0]}
            style={{ width: `${total ? (v / total) * 100 : 0}%` }}
          />
        ))}
      </div>
      <span className="whitespace-nowrap text-sm">
        {values.map((v, i) => `${faces[i]} ${total ? Math.round((v / total) * 100) : 0}%`).join(' · ')}
      </span>
    </div>
  );
}
