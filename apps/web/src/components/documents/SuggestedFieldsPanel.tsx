'use client';

import { useState } from 'react';
import { FieldSuggestion, SuggestibleField } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

const FIELD_LABELS: Record<SuggestibleField, string> = {
  title: 'ชื่อเรื่อง',
  opposingParty: 'คู่กรณี',
  courtName: 'ศาล',
  incidentDate: 'วันเกิดเหตุ',
  claimedAmount: 'ทุนทรัพย์ที่เรียกร้อง',
  estimatedDamage: 'ความเสียหายโดยประมาณ',
};

/** Money and dates read very differently as raw values than as fields. */
function display(field: SuggestibleField, value: string): string {
  if (!value) return '';
  if (field === 'incidentDate') return formatDate(value);
  if (field === 'claimedAmount' || field === 'estimatedDamage') {
    const amount = Number(value);
    return Number.isFinite(amount) ? `${amount.toLocaleString('th-TH')} บาท` : value;
  }
  return value;
}

export interface SuggestedFieldsPanelProps {
  suggestions: FieldSuggestion[];
  /** What each field holds right now, so a lawyer sees what would change. */
  current: Partial<Record<SuggestibleField, string>>;
  /**
   * Fields this form actually has. A value the form cannot hold is not shown:
   * offering it would only be a button that does nothing.
   */
  accepts: SuggestibleField[];
  onApply: (field: SuggestibleField, value: string) => void;
}

/**
 * What the documents said, next to what the form holds.
 *
 * Nothing here writes itself into the form. Every value carries the sentence it
 * came from, and applying one is a click — because a figure a lawyer did not
 * choose is a figure that ends up in a filing nobody checked. Where the
 * documents disagree, every reading is listed rather than resolved.
 */
export function SuggestedFieldsPanel({
  suggestions,
  current,
  accepts,
  onApply,
}: SuggestedFieldsPanelProps) {
  const [applied, setApplied] = useState<string[]>([]);
  const usable = suggestions.filter((suggestion) => accepts.includes(suggestion.field));
  if (usable.length === 0) return null;

  const key = (suggestion: FieldSuggestion) => `${suggestion.field}:${suggestion.value}`;

  const byField = usable.reduce<Partial<Record<SuggestibleField, FieldSuggestion[]>>>(
    (grouped, suggestion) => {
      (grouped[suggestion.field] ??= []).push(suggestion);
      return grouped;
    },
    {},
  );

  // Only fields the form has not filled, and only where the documents agree —
  // a contested value is a decision, not a bulk action.
  const uncontestedEmpty = Object.entries(byField).filter(
    ([field, items]) =>
      items!.length === 1 && !current[field as SuggestibleField]?.trim(),
  );

  const apply = (suggestion: FieldSuggestion) => {
    onApply(suggestion.field, suggestion.value);
    setApplied((previous) => [...new Set([...previous, key(suggestion)])]);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">ข้อมูลที่พบในเอกสาร</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            ตรวจแล้วกดใช้ทีละช่อง — ระบบไม่กรอกให้เอง
          </p>
        </div>
        {uncontestedEmpty.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => uncontestedEmpty.forEach(([, items]) => apply(items![0]))}
          >
            ใช้ค่าที่ยังว่าง ({uncontestedEmpty.length} ช่อง)
          </Button>
        )}
      </div>

      <ul className="mt-3 space-y-3">
        {Object.entries(byField).map(([field, items]) => {
          const typed = field as SuggestibleField;
          const now = current[typed]?.trim();
          return (
            <li key={field} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-sm font-medium">{FIELD_LABELS[typed]}</span>
                <span className="text-xs text-muted-foreground">
                  {now ? `ตอนนี้: ${display(typed, now)}` : 'ตอนนี้: ยังไม่ได้กรอก'}
                </span>
                {items!.length > 1 && (
                  <span className="text-xs text-warning">
                    เอกสารไม่ตรงกัน {items!.length} ค่า — เลือกเอง
                  </span>
                )}
              </div>

              <ul className="mt-2 space-y-2">
                {items!.map((suggestion) => {
                  const isApplied = applied.includes(key(suggestion));
                  const isCurrent = now === suggestion.value;
                  return (
                    <li
                      key={key(suggestion)}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-muted/40 p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm">
                          {display(suggestion.field, suggestion.value)}
                        </p>
                        <p className="mt-1 break-words text-xs text-muted-foreground">
                          {suggestion.sourceFilename ? `${suggestion.sourceFilename}: ` : ''}
                          <q>{suggestion.sourceExcerpt}</q>
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={isCurrent || isApplied ? 'ghost' : 'outline'}
                        disabled={isCurrent}
                        onClick={() => apply(suggestion)}
                      >
                        {isCurrent ? 'ใช้ค่านี้อยู่' : isApplied ? 'ใช้อีกครั้ง' : 'ใช้ค่านี้'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
