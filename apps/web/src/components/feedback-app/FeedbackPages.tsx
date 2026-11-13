'use client';
import { useCallback, useEffect, useState } from 'react';
import { Fragment as ReactFragment } from 'react';
import { api, type FeedbackPage, type FeedbackComment, type FeedbackPlatform } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { control, faces, platformLabel, RATING_LEGEND, State, Scores } from './FeedbackShared';

export function FeedbackPages({ token }: { token: string }) {
  const [platform, setPlatform] = useState<FeedbackPlatform | ''>('');
  const [days, setDays] = useState(90);
  const [pages, setPages] = useState<FeedbackPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState('');
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    setExpanded('');
    try {
      setPages(await api.getFeedbackPages(token, { platform: platform || undefined, days }));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token, platform, days]);
  useEffect(() => {
    void load();
  }, [load]);
  async function expand(page: FeedbackPage) {
    const key = `${page.route}:${page.platform}`;
    if (expanded === key) {
      setExpanded('');
      return;
    }
    setExpanded(key);
    setCommentsLoading(true);
    setCommentsError(false);
    try {
      setComments(
        await api.getFeedbackPageComments(token, {
          route: page.route,
          platform: (page.platform as FeedbackPlatform | null) ?? undefined,
          days,
        }),
      );
    } catch {
      setCommentsError(true);
    } finally {
      setCommentsLoading(false);
    }
  }
  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">สรุปรายหน้า</h1>
          <p className="text-sm text-muted-foreground">
            คะแนนจากแถบ หน้านี้ใช้งานเป็นยังไงบ้าง
            เรียงจากหน้าที่มีคนใช้ยากมากที่สุด
          </p>
        </div>
        <div className="flex gap-2">
          <select
            aria-label="แพลตฟอร์ม"
            className={control}
            value={platform}
            onChange={(e) => setPlatform(e.target.value as FeedbackPlatform | '')}
          >
            <option value="">ทุกแพลตฟอร์ม</option>
            <option value="web">Web</option>
            <option value="ios">iOS</option>
            <option value="android">Android</option>
          </select>
          <select
            aria-label="ช่วงเวลา"
            className={control}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={30}>30 วันล่าสุด</option>
            <option value={90}>90 วันล่าสุด</option>
            <option value={365}>365 วันล่าสุด</option>
          </select>
          <span className={control}>
            พบ {pages.reduce((n, p) => n + p.responses, 0)} คำตอบ จาก {pages.length} หน้าจอ
          </span>
        </div>
      </div>
      <State loading={loading} error={error} retry={() => void load()} empty={!pages.length}>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                {[
                  'หน้า', 'แพลตฟอร์ม', 'คนตอบ',
                  'สัดส่วนคะแนนความพึงพอใจ', 'ความเห็น',
                ].map((x) => (
                  <th key={x} className="p-3">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => {
                const key = `${page.route}:${page.platform}`;
                return (
                  <ReactFragment key={key}>
                    <tr className="border-t border-border">
                      <td className="p-3 font-mono">{page.route}</td>
                      <td className="p-3">{page.platform ? platformLabel(page.platform, page.platform) : '—'}</td>
                      <td className="p-3">{page.responses}</td>
                      <td className="p-3">
                        <Scores {...page} />
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          aria-expanded={expanded === key}
                          onClick={() => void expand(page)}
                          className="focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {page.comments} ความเห็น {expanded === key ? '⌃' : '⌄'}
                        </button>
                      </td>
                    </tr>
                    {expanded === key && (
                      <tr>
                        <td colSpan={5} className="border-l-2 border-primary bg-muted/30 p-5">
                          <h3 className="mb-3 font-semibold">ความคิดเห็นล่าสุดสำหรับหน้านี้</h3>
                          <State
                            loading={commentsLoading}
                            error={commentsError}
                            retry={() => {
                              setExpanded('');
                              void expand(page);
                            }}
                            empty={!comments.length}
                          >
                            <div className="grid gap-3 md:grid-cols-3">
                              {comments.map((c) => (
                                <div key={c.id} className="rounded-lg border border-border bg-card p-4">
                                  <div className="flex justify-between">
                                    <span>{faces[(c.rating ?? 1) - 1]}</span>
                                    <span className="text-muted-foreground">{formatDate(c.createdAt)}</span>
                                  </div>
                                  <p className="my-3 whitespace-pre-wrap">{c.message}</p>
                                  <p className="border-t border-border pt-2 font-medium">{c.user.name}</p>
                                  <p className="text-muted-foreground">{c.firm?.name}</p>
                                </div>
                              ))}
                            </div>
                          </State>
                        </td>
                      </tr>
                    )}
                  </ReactFragment>
                );
              })}
            </tbody>
          </table>
          <div className="flex justify-end gap-4 border-t border-border p-3 text-sm text-muted-foreground">
            {RATING_LEGEND.map(([swatch, label]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={`h-2.5 w-2.5 rounded-sm ${swatch}`} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </State>
    </section>
  );
}
