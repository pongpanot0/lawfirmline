'use client';

import { getMentionContext } from '@/lib/mentions';
import { useEffect, useRef, useState, useMemo } from 'react';
import { Trash2, AtSign } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, CaseCommentEntry } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { confirmDialog } from '@/lib/confirm-dialog';

const TIME = new Intl.DateTimeFormat('th-TH', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Bangkok',
});

const DAY = new Intl.DateTimeFormat('th-TH', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Bangkok',
});

interface CaseTeamMember {
  id: string;
  firstName: string;
  lastName: string;
}

interface MentionMatch {
  startIdx: number;
  endIdx: number;
  userId: string;
}

export function CaseCommentsPanel({
  caseId,
  teamMembers = [],
}: {
  caseId: string;
  teamMembers?: CaseTeamMember[];
}) {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const [comments, setComments] = useState<CaseCommentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const filteredMembers = useMemo(() => {
    if (!showMentionPicker) return [];
    return teamMembers.filter(
      (m) =>
        m.firstName.toLowerCase().includes(mentionQuery) ||
        m.lastName.toLowerCase().includes(mentionQuery),
    );
  }, [showMentionPicker, mentionQuery, teamMembers]);

  const [loadError, setLoadError] = useState(false);
  const load = () => {
    if (!token || !caseId) return;
    api
      .getCaseComments(token, caseId)
      .then((items) => { setComments(items); setLoadError(false); })
      .catch((err) => { console.error(err); setLoadError(true); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [token, caseId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowMentionPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setBody(newText);

    // Check if typing @ for mentions
    const cursorPos = e.target.selectionStart;
    const context = getMentionContext(newText, cursorPos);

    if (context) {
      setShowMentionPicker(true);
      setMentionQuery(context.query);
      setMentionIndex(0);
    } else {
      setShowMentionPicker(false);
    }

    // Detect deleted mentions
    const prevMatches = extractMentionMatches(body);
    const newMatches = extractMentionMatches(newText);
    const deletedIds = prevMatches
      .filter((m) => !newMatches.some((nm) => nm.userId === m.userId))
      .map((m) => m.userId);
    if (deletedIds.length > 0) {
      setMentionedUserIds((ids) => ids.filter((id) => !deletedIds.includes(id)));
    }
  };

  const extractMentionMatches = (text: string): MentionMatch[] => {
    const matches: MentionMatch[] = [];
    const members = new Map(teamMembers.map((m) => [`${m.firstName} ${m.lastName}`, m.id]));

    for (const [name, id] of members) {
      const regex = new RegExp(`@${name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}(?![^\\s@])`, 'g');
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({ startIdx: match.index, endIdx: match.index + match[0].length, userId: id });
      }
    }
    return matches;
  };

  const insertMention = (member: CaseTeamMember) => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart;
    const context = getMentionContext(body, cursorPos);
    if (!context) return;

    const beforeMention = body.substring(0, context.startIdx - 1);
    const afterMention = body.substring(cursorPos);
    const mentionText = `@${member.firstName} ${member.lastName} `;
    const newBody = beforeMention + mentionText + afterMention;

    setBody(newBody);
    setShowMentionPicker(false);
    setMentionedUserIds((ids) =>
      ids.includes(member.id) ? ids : [...ids, member.id],
    );

    // Move cursor after inserted mention
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = beforeMention.length + mentionText.length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionPicker && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredMembers.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredMembers.length) % filteredMembers.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        insertMention(filteredMembers[mentionIndex]);
      } else if (e.key === 'Escape') {
        setShowMentionPicker(false);
      }
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleSend = async () => {
    if (!token || !caseId || !body.trim()) return;
    setSending(true);
    setError('');
    try {
      const matches = extractMentionMatches(body);
      const ids = Array.from(new Set(matches.map((m) => m.userId)));
      await api.createCaseComment(token, caseId, body.trim(), ids.length > 0 ? ids : undefined);
      setBody('');
      setMentionedUserIds([]);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ส่งบันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setSending(false);
    }
  };

  const renderBodyWithMentions = (text: string, mIds: string[]) => {
    const members = new Map(mIds.map((id) => {
      const member = teamMembers.find((m) => m.id === id);
      return member ? [`${member.firstName} ${member.lastName}`, member.id] : null;
    }).filter(Boolean) as Array<[string, string]>);

    if (members.size === 0) return text;

    const parts: React.ReactNode[] = [];
    let lastIdx = 0;

    for (const [name, id] of members) {
      const regex = new RegExp(`@${name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}(?![^\\s@])`, 'g');
      let match;
      while ((match = regex.exec(text)) !== null) {
        parts.push(text.substring(lastIdx, match.index));
        parts.push(
          <span key={`mention-${id}-${match.index}`} className="font-semibold text-primary">
            {match[0]}
          </span>,
        );
        lastIdx = match.index + match[0].length;
      }
    }
    parts.push(text.substring(lastIdx));
    return parts;
  };

  const handleDelete = async (commentId: string) => {
    if (!token || !caseId) return;
    const target = comments.find((item) => item.id === commentId);
    const preview = target ? target.body.slice(0, 40) : '';
    if (!await confirmDialog(`ลบบันทึก "${preview}${target && target.body.length > 40 ? '…' : ''}"?`)) return;
    try {
      await api.deleteCaseComment(token, caseId, commentId);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ลบบันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    }
  };

  if (loading) return <PageLoading title={d.common.loading} lines={3} />;

  let lastDay = '';

  return (
    <section className="space-y-4 rounded-xl border border-[#e2e0d8] bg-card p-5 shadow-[0_4px_16px_rgba(20,46,67,.06)]">
      {loadError && <LoadFailed onRetry={load} />}
      {!loadError && comments.length === 0 && <div><p className="font-semibold">ยังไม่มีบันทึกในทีม</p><p className="mt-[.3rem] text-[.82rem] leading-[1.45] text-muted-foreground">จดสิ่งที่ทีมควรรู้เกี่ยวกับคดีนี้ ใช้ @ชื่อ เพื่อแจ้งเตือนคนในทีม</p></div>}
      {comments.length > 0 && <div className="max-h-[55vh] space-y-4 overflow-y-auto overscroll-contain">
        {comments.map((c) => {
          const initials = `${c.authorFirstName[0] ?? ''}${c.authorLastName[0] ?? ''}`.toUpperCase();
          const isAuthor = user?.id === c.authorId;
          return <div key={c.id} className="flex gap-3">
            <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#243c50] text-xs text-white">{initials}</span>
            <div className="min-w-0 rounded-xl bg-[#f3f1ea] px-4 py-3">
              <div className="flex items-start justify-between gap-2"><span><b>{c.authorFirstName} {c.authorLastName}</b> <span className="text-[.8rem] text-muted-foreground">· {DAY.format(new Date(c.createdAt))} {TIME.format(new Date(c.createdAt))}</span></span>{isAuthor && <button type="button" onClick={() => handleDelete(c.id)} className="-my-2 -mr-2 inline-flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="ลบบันทึก"><Trash2 aria-hidden="true" className="h-3.5 w-3.5" /></button>}</div>
              <p className="mt-1 whitespace-pre-wrap">{renderBodyWithMentions(c.body, c.mentionedUserIds)}</p>
            </div>
          </div>;
        })}
        <div ref={bottomRef} />
      </div>}
      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      <div className="border-t border-[#e2e0d8] pt-4">
        <div className="relative">
          <textarea ref={textareaRef} value={body} onChange={handleTextChange} onKeyDown={handleKeyDown} aria-label="บันทึกภายในทีม" placeholder="พิมพ์บันทึก… ใช้ @ชื่อ เพื่อแจ้งเตือนคนในทีม" className="mt-1 min-h-[90px] w-full rounded-lg border border-[#c9ccc6] bg-white px-[.8rem] py-[.55rem] text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-[15px]" />
          {showMentionPicker && filteredMembers.length > 0 && (
            <div
              ref={pickerRef}
              className="absolute bottom-full left-0 mb-2 max-h-48 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg"
            >
              {filteredMembers.map((member, idx) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => insertMention(member)}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-accent ${
                    idx === mentionIndex ? 'bg-accent' : ''
                  }`}
                >
                  <AtSign aria-hidden="true" className="mr-2 inline h-3.5 w-3.5" />
                  {member.firstName} {member.lastName}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3"><p className="text-[.82rem] leading-[1.45] text-muted-foreground">กด Enter เพื่อขึ้นบรรทัดใหม่ · กด Ctrl+Enter หรือปุ่มเพื่อส่ง</p><button type="button" onClick={handleSend} disabled={sending || !body.trim()} className="inline-flex min-h-11 items-center justify-center gap-[.4rem] rounded-lg bg-[#142e43] px-4 text-[.95rem] font-semibold text-[#fffdfa] disabled:opacity-60">{sending ? 'กำลังส่ง…' : 'ส่งบันทึก'}</button></div>
      </div>
    </section>
  );
}
