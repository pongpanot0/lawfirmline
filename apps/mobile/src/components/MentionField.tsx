import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/AppText';
import { insertMention, matchPeople, mentionQuery, type MentionPerson } from '@/mentions';
import { colors, spacing, TOUCH } from '@/theme';
import { FormField } from './Form';
import { Card } from './ui';

/**
 * A note field whose "@" opens an inline list right under it (not a modal), with the D9 hint.
 * Under, not above: a list growing above the field pushed the text being typed off screen.
 */
export function MentionField({ label, value, onChange, people, onPick, notifying = [], disabled = false }: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  people: MentionPerson[];
  onPick: (person: MentionPerson) => void;
  /** Names the note will notify on save, shown while no list is open. */
  notifying?: string[];
  disabled?: boolean;
}) {
  const query = mentionQuery(value);
  const matches = query === null ? [] : matchPeople(people, query);
  return <View style={{ gap: spacing.sm }}>
    <FormField label={label} value={value} onChange={onChange} multiline disabled={disabled}
      placeholder={people.length ? 'พิมพ์ @ เพื่อแจ้งคนในทีม' : undefined} />
    {/* No people loaded (offline, error): no list, and plain text still sends. */}
    {query !== null && people.length > 0 && !disabled ? <Card style={{ paddingVertical: spacing.xs }}>
      {matches.length ? matches.map((person) => <Pressable key={person.id} accessibilityRole="button"
        accessibilityLabel={`กล่าวถึง ${person.firstName} ${person.lastName}`}
        onPress={() => { onChange(insertMention(value, person.firstName)); onPick(person); }}
        style={({ pressed }) => [{ minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: spacing.sm }, pressed && { backgroundColor: colors.soft }]}>
        <Text style={{ color: colors.ink }}>@{person.firstName} <Text style={{ color: colors.muted }}>{person.lastName}</Text></Text>
      </Pressable>) : <Text style={{ color: colors.muted, paddingVertical: spacing.sm }}>ไม่พบชื่อนี้</Text>}
      <Text style={{ color: colors.muted, fontSize: 12, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line }}>
        แจ้งเตือนเฉพาะคนที่เปิดงานนี้ได้
      </Text>
    </Card> : notifying.length ? <Text style={{ color: colors.info, fontSize: 13 }}>จะแจ้งเตือน: {notifying.join(', ')}</Text> : null}
  </View>;
}
