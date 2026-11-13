'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type FeedbackItem, type FeedbackKind, type PlatformFirm } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { Skeleton } from '@/components/ui/misc';
import { formatDate } from '@/lib/utils';
import { relativeTimeTh } from '@/lib/relative-time';
import { Image as ImageIcon } from 'lucide-react';
import { control, KindBadge, labels, platformLabel, State } from './FeedbackShared';

export function FeedbackList({
  token,
  open,
  refreshSummary,
}: {
  token: string;
  open: number | null;
  refreshSummary: () => void;
}) {
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>('open');
  const [kind, setKind] = useState<FeedbackKind | ''>('');
  const [firmId, setFirmId] = useState('');
  const [q, setQ] = useState('');
  const [firmsError, setFirmsError] = useState(false);
  const [firms, setFirms] = useState<PlatformFirm[]>([]);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<FeedbackItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState('');
  const [imageError, setImageError] = useState(false);
  // Only the newest request may write: a slow answer for old filters must not repaint the list,
  // or a bulk resolve could act on rows the admin is not looking at.
  const generation = useRef(0);
  const load = useCallback(
    async (next?: string) => {
      const mine = ++generation.current;
      setLoading(true);
      setError(false);
      try {
        const data = await api.getFeedback(token, {
          status,
          kind: kind || undefined,
          firmId: firmId || undefined,
          q: q.trim() || undefined,
          cursor: next,
        });
        if (mine !== generation.current) return;
        setItems((old) => (next ? [...old, ...data.items] : data.items));
        setCursor(data.nextCursor);
        if (!next) setSelected([]);
      } catch {
        if (mine === generation.current) setError(true);
      } finally {
        if (mine === generation.current) setLoading(false);
      }
    },
    [token, status, kind, firmId, q],
  );
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    api
      .getPlatformFirms(token)
      .then(setFirms)
      .catch(() => setFirmsError(true));
  }, [token]);
  useEffect(() => {
    if (!active?.hasScreenshot) {
      setImage('');
      return;
    }
    let url = '';
    let cancelled = false;
    setImage('');
    setImageError(false);
    api
      .getFeedbackScreenshot(token, active.id)
      .then((blob) => {
        if (!cancelled) {
          url = URL.createObjectURL(blob);
          setImage(url);
        }
      })
      .catch(() => {
        if (!cancelled) setImageError(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [token, active]);
  async function resolve(ids: string[]) {
    if (!ids.length || busy) return;
    setBusy(true);
    try {
      await api.resolveFeedback(token, ids, true);
      setActive(null);
      refreshSummary();
      await load();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h1 className="text-2xl font-semibold">รายการ feedback</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        รายงานปัญหา ข้อเสนอแนะ และคะแนนที่มีข้อความ
      </p>
      <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-border bg-card p-3">
        <div className="flex rounded-lg bg-muted p-1">
          {(
            [
              ['open', open === null ? 'รอดำเนินการ' : `รอดำเนินการ (${open})`],
              ['resolved', 'ดำเนินการแล้ว'],
              ['all', 'ทั้งหมด'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              aria-pressed={status === v}
              onClick={() => setStatus(v)}
              className={`rounded-md px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring ${status === v ? 'bg-card shadow-sm' : ''}`}
            >
              {l}
            </button>
          ))}
        </div>
        <select
          aria-label="ประเภท"
          className={control}
          value={kind}
          onChange={(e) => setKind(e.target.value as FeedbackKind | '')}
        >
          <option value="">ทุกประเภท</option>
          {Object.entries(labels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="สำนักงาน"
          className={control}
          value={firmId}
          onChange={(e) => setFirmId(e.target.value)}
        >
          <option value="">ทุกสำนักงาน</option>
          {firms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        {firmsError && (
          <span role="alert" className="self-center text-sm text-destructive">
            โหลดรายชื่อสำนักงานไม่สำเร็จ
          </span>
        )}
        <input
          aria-label="ค้นหา feedback"
          className={`${control} ml-auto`}
          placeholder="ค้นหาข้อความ, ผู้ส่ง, สำนักงาน..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {selected.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted p-3">
          <strong>เลือก {selected.length} รายการ</strong>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">ย้ายไปแท็บดำเนินการแล้ว</span>
            <Button disabled={busy} onClick={() => void resolve(selected)}>
              ทำเครื่องหมายว่าดำเนินการแล้ว
            </Button>
          </div>
        </div>
      )}
      <State loading={loading} error={error} retry={() => void load()} empty={!items.length}>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="p-3">
                  <input
                    type="checkbox"
                    aria-label="เลือกทั้งหมด"
                    checked={!!items.length && selected.length === items.length}
                    onChange={(e) => setSelected(e.target.checked ? items.map((x) => x.id) : [])}
                  />
                </th>
                {['ประเภท', 'ข้อความ', 'หน้า', 'แหล่ง', 'ผู้ส่ง', 'เวลา'].map((x) => (
                  <th key={x} className="p-3">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setActive(item)}
                  className="cursor-pointer border-t border-border hover:bg-muted/50"
                >
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`เลือก ${item.message}`}
                      checked={selected.includes(item.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? [...selected, item.id] : selected.filter((x) => x !== item.id),
                        )
                      }
                    />
                  </td>
                  <td className="p-3">
                    <KindBadge kind={item.kind} rating={item.rating} />
                  </td>
                  <td className="max-w-xs p-3">
                    <button
                      type="button"
                      onClick={() => setActive(item)}
                      className="line-clamp-2 text-left font-medium focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.message}{' '}
                      {item.hasScreenshot && <ImageIcon aria-label="มีภาพแนบ" className="inline h-4 w-4" />}
                    </button>
                  </td>
                  <td className="p-3 font-mono">{item.route ?? '—'}</td>
                  <td className="p-3">{platformLabel(item.platform, item.source)}</td>
                  <td className="p-3">
                    {item.user.name}
                    <br />
                    <span className="text-muted-foreground">{item.firm?.name}</span>
                  </td>
                  <td className="p-3">{relativeTimeTh(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {cursor && (
            <div className="p-3 text-center">
              <Button variant="outline" onClick={() => void load(cursor)}>
                โหลดเพิ่มเติม
              </Button>
            </div>
          )}
        </div>
      </State>
      <SideDrawer open={!!active} title={active ? labels[active.kind] : ''} onClose={() => setActive(null)}>
        {active && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              {formatDate(active.createdAt)} · {active.user.name} · {active.firm?.name ?? '—'}
            </p>
            <div className="whitespace-pre-wrap rounded-lg bg-muted p-4">
              <h3 className="mb-2 text-sm font-medium">ข้อความฉบับเต็ม</h3>
              {active.message}
            </div>
            {active.hasScreenshot && (
              <div>
                <h3 className="font-medium">ภาพหน้าจอที่แนบมา</h3>
                {image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */ <img
                    src={image}
                    alt="ภาพหน้าจอที่แนบมา"
                    className="mt-2 max-w-full rounded-lg"
                  />
                ) : imageError ? (
                  <p role="alert">โหลดภาพไม่สำเร็จ</p>
                ) : (
                  <Skeleton className="mt-2 h-32 w-full" />
                )}
              </div>
            )}
            <div className="rounded-lg border border-border p-4 text-sm">
              <h3 className="mb-2 font-medium">บริบททางเทคนิค</h3>
              <p>หน้า: {active.route ?? '—'}</p>
              <p>แพลตฟอร์ม: {platformLabel(active.platform, active.source)}</p>
              <p>เวอร์ชันแอป: {active.appVersion ?? '—'}</p>
              <p>เวลาบันทึก: {formatDate(active.createdAt)}</p>
            </div>
            {!active.resolvedAt && (
              <Button className="w-full" disabled={busy} onClick={() => void resolve([active.id])}>
                ทำเครื่องหมายว่าดำเนินการแล้ว
              </Button>
            )}
            <p className="text-center text-sm text-muted-foreground">
              ผู้ส่งไม่ได้รับแจ้ง ใช้เพื่อจัดการรายการเท่านั้น
            </p>
          </div>
        )}
      </SideDrawer>
    </section>
  );
}
