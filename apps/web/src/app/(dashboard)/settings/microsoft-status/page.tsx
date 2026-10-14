'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type M365AdminStatus } from '@/lib/api';
import { relativeTimeTh } from '@/lib/relative-time';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Conn = M365AdminStatus['connections'][number];

const BADGE: Record<Conn['health'], { text: string; cls: string }> = {
  OK: { text: 'ปกติ', cls: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-200' },
  WARN: { text: 'ควรตรวจ', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200' },
  BROKEN: { text: 'หลุด', cls: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200' },
};

function HealthBadge({ health }: { health: Conn['health'] }) {
  const b = BADGE[health];
  return <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${b.cls}`}>{b.text}</span>;
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
    <div className="mb-4 flex items-center gap-2">
      <Link href="/settings" className="text-muted-foreground" aria-label="กลับ"><ArrowLeft className="h-5 w-5" /></Link>
      <h1 className="text-xl font-bold">สถานะ Microsoft 365</h1>
    </div>
  );

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        {header}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}
        </div>
        <div className="mt-4 h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        {header}
        <p className="rounded-xl bg-destructive/10 p-4 text-base text-destructive">{error?.text ?? 'โหลดสถานะไม่สำเร็จ'}</p>
        {!error?.forbidden && <Button className="mt-3" onClick={() => void load()}>ลองใหม่</Button>}
      </div>
    );
  }

  const { summary, connections, failingLinks, notConnected } = data;
  const rank = { BROKEN: 0, WARN: 1, OK: 2 } as const;
  const problems = connections.filter((c) => c.health !== 'OK').sort((a, b) => rank[a.health] - rank[b.health]);
  const allGood = problems.length === 0 && failingLinks.length === 0;
  const tiles: Array<{ label: string; value: string; red?: boolean }> = [
    { label: 'เชื่อมต่อแล้ว', value: `${summary.connected}/${summary.members}` },
    { label: 'มีปัญหา', value: String(summary.problems), red: summary.problems > 0 },
    { label: 'ยังไม่เชื่อมต่อ', value: String(summary.notConnected) },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      {header}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{t.label}</p>
              <p className={`text-3xl font-bold ${t.red ? 'text-red-600' : ''}`}>{t.value}</p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">อัปเดตล่าสุด</p>
            <p className="text-base font-semibold">{relativeTimeTh(data.generatedAt, new Date(), '-')}</p>
            <Button size="sm" variant="outline" className="mt-1" disabled={loading} onClick={() => void load()}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />รีเฟรช
            </Button>
          </CardContent>
        </Card>
      </div>

      {notice && (
        <p className={`rounded-xl p-3 text-base ${notice.ok ? 'bg-green-50 text-green-800' : 'bg-destructive/10 text-destructive'}`}>{notice.text}</p>
      )}

      {allGood ? (
        <p className="rounded-xl bg-green-50 p-4 text-lg font-semibold text-green-800 dark:bg-green-950/30 dark:text-green-200">ทุกบัญชีทำงานปกติ</p>
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
                      <summary className="cursor-pointer">รายละเอียด</summary>
                      <p className="mt-1 break-all">{c.lastError}</p>
                    </details>
                  )}
                  {c.health === 'BROKEN' && (
                    <Button disabled={reminding === c.id} onClick={() => void remind(c)}>แจ้งให้เชื่อมต่อใหม่</Button>
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
                    className="inline-block text-sm text-primary underline"
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
                    <dd>{c.folderLinks.total}{c.folderLinks.failing > 0 && <span className="text-red-600"> (ผิดพลาด {c.folderLinks.failing})</span>}</dd>
                  </div>
                  <div><dt className="text-muted-foreground">OneDrive ที่ผูก</dt><dd>{c.driveLinks}</dd></div>
                </dl>
              </CardContent>
            </Card>
          ))}
          {connections.length === 0 && <p className="text-base text-muted-foreground">ยังไม่มีบัญชีที่เชื่อมต่อ</p>}
        </div>
      </section>

      {notConnected.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-bold">ยังไม่ได้เชื่อมต่อ</h2>
          <p className="mb-2 text-sm text-muted-foreground">ให้เข้า ตั้งค่า → Microsoft 365 → เชื่อมต่อ</p>
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
          <li>บัญชีของคนนั้นขึ้น &quot;หลุด&quot; ไหม → กดแจ้งให้เชื่อมต่อใหม่</li>
          <li>folder ผูกกับคดีหรือยัง (หน้า จับคู่ folder)</li>
          <li>ซิงก์ล่าสุดนานเกิน 2 ชม. → กด ซิงก์ตอนนี้ ในหน้าตั้งค่าของเจ้าของบัญชี</li>
          <li>ถ้า error ว่า &quot;ไม่มีสิทธิ์เข้าถึง&quot; → ผู้ดูแล Microsoft ขององค์กรต้องกด admin consent</li>
        </ol>
      </section>
    </div>
  );
}
