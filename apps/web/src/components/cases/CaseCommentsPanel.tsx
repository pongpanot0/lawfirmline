'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Trash2, AtSign } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, CaseCommentEntry } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';

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

  // Extract current @mention query from body at cursor position
  const getMentionContext = (text: string, cursorPos: number) => {
    const beforeCursor = text.substring(0, cursorPos);
    const lastAt = beforeCursor.lastIndexOf('@');
    if (lastAt === -1) return null;
    const afterLastAt = beforeCursor.substring(lastAt + 1);
    if (!/^[^\s@]*$/.test(afterLastAt)) return null; // any name chars (incl. Thai) until whitespace
    return { startIdx: lastAt + 1, query: afterLastAt.toLowerCase() };
  };

  const filteredMembers = useMemo(() => {
    if (!showMentionPicker) return [];
    return teamMembers.filter(
      (m) =>
        m.firstName.toLowerCase().includes(mentionQuery) ||
        m.lastName.toLowerCase().includes(mentionQuery),
    );
  }, [showMentionPicker, mentionQuery, teamMembers]);

  const load = () => {
    if (!token || !caseId) return;
    api
      .getCaseComments(token, caseId)
      .then(setComments)
      .catch(console.error)
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
      setError(e instanceof ApiError ? e.message : 'ส่งความคิดเห็นไม่สำเร็จ');
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
    try {
      await api.deleteCaseComment(token, caseId, commentId);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ลบความคิดเห็นไม่สำเร็จ');
    }
  };

  if (loading) return <PageLoading title={d.common.loading} lines={3} />;

  let lastDay = '';

  return (
    <div className="rounded-xl border bg-card shadow-soft">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold text-foreground">ความเห็นภายในทีม</h2>
        <p className="text-sm text-muted-foreground">
          ความเห็นและข้อสังเกตภายในทีมงาน — ไม่แสดงให้ลูกความเห็น
        </p>
      </div>

      <div className="max-h-[50vh] space-y-1 overflow-y-auto px-5 py-4">
        {comments.length === 0 && (
          <InlineEmptyState
            title="ยังไม่มีความเห็น"
            description="ความเห็นจากทีมงานจะแสดงตรงนี้"
          />
        )}
        {comments.map((c) => {
          const day = DAY.format(new Date(c.createdAt));
          const newDay = day !== lastDay;
          lastDay = day;
          const initials = `${c.authorFirstName[0]}${c.authorLastName[0]}`.toUpperCase();
          const isAuthor = user?.id === c.authorId;

          return (
            <div key={c.id}>
              {newDay && (
                <div className="my-3 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">{day}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              <div className="flex gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {c.authorFirstName} {c.authorLastName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {TIME.format(new Date(c.createdAt))}
                      </span>
                    </div>
                    {isAuthor && (
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="rounded p-1 hover:bg-destructive/20"
                        aria-label="ลบ"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {renderBodyWithMentions(c.body, c.mentionedUserIds)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-5 pb-2 text-sm text-destructive">{error}</p>}

      <div className="border-t p-4">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            rows={3}
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-soft transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="พิมพ์ความเห็น (@ เพื่อกล่าวถึง, ⌘+Enter เพื่อส่ง)..."
          />
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
                  <AtSign className="mr-2 inline h-3.5 w-3.5" />
                  {member.firstName} {member.lastName}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setBody('');
              setMentionedUserIds([]);
              setShowMentionPicker(false);
            }}
          >
            ยกเลิก
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={sending || !body.trim()}
          >
            {sending ? 'กำลังส่ง...' : 'ส่ง'}
          </Button>
        </div>
      </div>
    </div>
  );
}
