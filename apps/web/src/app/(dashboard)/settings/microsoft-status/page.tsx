'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type M365AdminStatus } from '@/lib/api';
import { relativeTimeTh } from '@/lib/relative-time';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { InlineEmptyState } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { KpiStrip } from '@/components/reports/KpiStrip';

type Conn = M365AdminStatus['connections'][number];

const BADGE: Record<Conn['health'], { text: string; variant: BadgeProps['variant'] }> = {
  OK: { text: 'ปกติ', variant: 'success' },
  WARN: { text: 'ควรตรวจ', variant: 'warning' },
  BROKEN: { text: 'หลุด', variant: 'destructive' },
};

function HealthBadge({ health }: { health: Conn['health'] }) {
  const b = BADGE[health];
  return <Badge variant={b.variant}>{b.text}</Badge>;
}

const onOff = (v: boolean) => (v ? 'เปิด' : 'ปิด');
const connName = (c: Conn) => c.user?.name ?? c.mailboxAddress;

export default function MicrosoftStatusPage() {
  const { token } = useAuth();
  const [data, setData] = useState<M365AdminStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ forbidden: boolean; text: string } | null>(null);
  const [reminding, setReminding] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.getM365AdminStatus(token));
    } catch (e) {
      const forbidden = e instanceof ApiError && e.status === 403;
      setError({ forbidden, text: forbidden ? 'เฉพาะเจ้าของสำนักงานหรือผู้จัดการสำนักงาน' : 'โหลดสถานะไม่สำเร็จ' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function remind(c: Conn) {
    if (!token) return;
    setReminding(c.id);
    setNotice(null);
    try {
      await api.remindM365Reconnect(token, c.id);
      setNotice({ ok: true, text: `ส่งแจ้งเตือนถึง ${connName(c)} แล้ว` });
    } catch (e) {
      setNotice({ ok: false, text: e instanceof ApiError ? e.message : 'ส่งแจ้งเตือนไม่สำเร็จ' });
    } finally {
      setReminding(null);
    }
  }

  const header = (
    <div>
      <Link href="/settings?view=office" className="inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />ตั้งค่าสำนักงาน
      </Link>
      <PageHeader
        title="สถานะ Microsoft 365"
        description={data ? `อัปเดตล่าสุด ${relativeTimeTh(data.generatedAt, new Date(), '-')}` : undefined}
        actions={
          <Button variant="outline" disabled={loading} onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" aria-hidden />รีเฟรช
          </Button>
        }
      />
    </div>
  );

  if (loading && !data) {
    return (
      <div role="status" aria-label="กำลังโหลดสถานะ" className="mx-auto max-w-4xl">
        {header}
        <div className="h-20 animate-pulse rounded-lg bg-muted" />
        <div className="mt-4 h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl">
        {header}
        {error?.forbidden
          ? <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-base text-destructive">{error.text}</p>
          : <LoadFailed message={error?.text ?? 'โหลดสถานะไม่สำเร็จ'} onRetry={() => void load()} />}
      </div>
    );
  }

  const { summary, connections, failingLinks, notConnected } = data;
  const rank = { BROKEN: 0, WARN: 1, OK: 2 } as const;
  const problems = connections.filter((c) => c.health !== 'OK').sort((a, b) => rank[a.health] - rank[b.health]);
  const allGood = problems.length === 0 && failingLinks.length === 0;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {header}

      <KpiStrip items={[
        { label: 'เชื่อมต่อแล้ว', value: `${summary.connected}/${summary.members}` },
        { label: 'มีปัญหา', value: String(summary.problems), tone: summary.problems > 0 ? 'destructive' : 'default' },
        { label: 'ยังไม่เชื่อมต่อ', value: String(summary.notConnected) },
      ]} />

      {notice && (
        <p role={notice.ok ? 'status' : 'alert'} className={`rounded-xl p-3 text-base ${notice.ok ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>{notice.text}</p>
      )}

      {allGood ? (
        <p className="rounded-xl bg-success/10 p-4 text-lg font-semibold text-success">ทุกบัญชีทำงานปกติ</p>
      ) : (
        <section>
          <h2 className="mb-2 text-lg font-bold">ต้องแก้ไข</h2>
          <div className="space-y-3">
            {problems.map((c) => (
              <Card key={c.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base font-semibold">{connName(c)}</p>
                      <p className="break-all text-sm text-muted-foreground">{c.mailboxAddress}</p>
                    </div>
                    <HealthBadge health={c.health} />
                  </div>
                  {c.healthReason && <p className="text-base">{c.healthReason}</p>}
                  <p className="text-sm text-muted-foreground">ซิงก์ล่าสุด {relativeTimeTh(c.lastSyncedAt)}</p>
                  {c.lastErrorThai && <p className="text-sm">{c.lastErrorThai}</p>}
                  {c.lastError && (
                    <details className="text-xs text-muted-foreground">
                      <summary className="inline-flex min-h-11 cursor-pointer items-center sm:min-h-0">รายละเอียด</summary>
                      <p className="mt-1 break-all">{c.lastError}</p>
                    </details>
                  )}
                  {c.health === 'BROKEN' && (
                    <Button variant="outline" disabled={reminding === c.id} onClick={() => void remind(c)}>แจ้ง {connName(c)} ให้เชื่อมต่อใหม่</Button>
                  )}
                </CardContent>
              </Card>
            ))}
            {failingLinks.map((l) => (
              <Card key={l.linkId}>
                <CardContent className="space-y-1 p-4">
                  <p className="text-base font-semibold break-words">{[l.ownRef, l.caseTitle].filter(Boolean).join(' · ')}</p>
                  <p className="text-sm text-muted-foreground break-all">
                    {l.kind === 'OUTLOOK_FOLDER' ? 'Folder อีเมล' : 'Folder OneDrive'}{l.displayPath ? `: ${l.displayPath}` : ''} ({l.mailboxAddress})
                  </p>
                  {l.lastErrorThai && <p className="text-sm">{l.lastErrorThai}</p>}
                  <Link
                    href={`/cases/${l.caseId}?tab=${l.kind === 'OUTLOOK_FOLDER' ? 'email' : 'documents'}`}
                    className="inline-flex min-h-11 items-center text-sm text-primary underline"
                  >
                    เปิดคดี
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-bold">ทุกบัญชี</h2>
        <div className="space-y-3">
          {connections.map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-semibold">{connName(c)}</p>
                    <p className="break-all text-sm text-muted-foreground">{c.mailboxAddress}</p>
                  </div>
                  <HealthBadge health={c.health} />
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-3">
                  <div><dt className="text-muted-foreground">ซิงก์ล่าสุด</dt><dd>{relativeTimeTh(c.lastSyncedAt)}</dd></div>
                  <div><dt className="text-muted-foreground">อีเมลเข้าคิวรับเรื่อง</dt><dd>{onOff(c.syncInboxToIntake)}</dd></div>
                  <div><dt className="text-muted-foreground">ปฏิทิน</dt><dd>{onOff(c.syncCalendar)}</dd></div>
                  <div>
                    <dt className="text-muted-foreground">Folder ที่ผูก</dt>
                    <dd className="tabular-nums">{c.folderLinks.total}{c.folderLinks.failing > 0 && <span className="text-destructive"> (ผิดพลาด {c.folderLinks.failing})</span>}</dd>
                  </div>
                  <div><dt className="text-muted-foreground">OneDrive ที่ผูก</dt><dd className="tabular-nums">{c.driveLinks}</dd></div>
                </dl>
              </CardContent>
            </Card>
          ))}
          {connections.length === 0 && <InlineEmptyState title="ยังไม่มีบัญชีที่เชื่อมต่อ" />}
        </div>
      </section>

      {notConnected.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-bold">ยังไม่ได้เชื่อมต่อ</h2>
          <p className="mb-2 text-sm text-muted-foreground">แต่ละคนเชื่อมต่อเองได้ที่ <Link href="/settings?view=integrations" className="text-primary underline">ตั้งค่า แท็บการเชื่อมต่อ</Link></p>
          <ul className="divide-y rounded-xl border">
            {notConnected.map((m) => (
              <li key={m.userId} className="p-3">
                <p className="text-base font-medium">{m.name}</p>
                <p className="break-all text-sm text-muted-foreground">{m.email}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl bg-muted p-4 text-base">
        <h2 className="mb-2 font-bold">อีเมลไม่เข้า? ตรวจตามนี้</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>บัญชีของคนนั้นขึ้น &quot;หลุด&quot; ให้กดแจ้งให้เชื่อมต่อใหม่</li>
          <li>folder ผูกกับคดีหรือยัง (<Link href="/settings/outlook-folders" className="text-primary underline">หน้าจับคู่ folder</Link>)</li>
          <li>ซิงก์ล่าสุดนานเกิน 2 ชม. ให้เจ้าของบัญชีกด ซิงก์ตอนนี้ ในหน้าตั้งค่าของตน</li>
          <li>error ว่า &quot;ไม่มีสิทธิ์เข้าถึง&quot; ผู้ดูแล Microsoft ขององค์กรต้องกด admin consent</li>
        </ol>
      </section>
    </div>
  );
}
