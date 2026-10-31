'use client';

import { useState } from 'react';
import { api, type LawyerLicense } from '@/lib/api';
import { licenseBadge } from '@/lib/license-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LicenseForm } from './LicenseForm';

type Member = LawyerLicense & { id: string; firstName: string; lastName: string };

export function LicenseBadge({ expiresAt }: { expiresAt: string | null }) {
  const badge = licenseBadge(expiresAt);
  return badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null;
}

function describe(m: LawyerLicense): string {
  if (!m.lawyerLicenseType) return m.lawyerLicenseNo ? `เลขที่ ${m.lawyerLicenseNo}` : 'ยังไม่ระบุ';
  const kind = m.lawyerLicenseType === 'LIFETIME' ? 'ตลอดชีพ' : `หมดอายุ ${m.lawyerLicenseExpiresAt ?? '—'}`;
  return [m.lawyerLicenseNo && `เลขที่ ${m.lawyerLicenseNo}`, kind].filter(Boolean).join(' · ');
}

/** Every member's licence; office roles (runOperations) can edit each one inline. */
export function MemberLicenses({
  members,
  token,
  canEdit,
  onSaved,
}: {
  members: Member[];
  token: string;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ใบอนุญาตทนายความ</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {members.map((m) => (
          <div key={m.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{m.firstName} {m.lastName}</p>
                <p className="text-sm text-muted-foreground">{describe(m)}</p>
              </div>
              <div className="flex items-center gap-2">
                <LicenseBadge expiresAt={m.lawyerLicenseExpiresAt} />
                {canEdit && (
                  <Button type="button" size="sm" variant="outline" aria-expanded={editing === m.id}
                    onClick={() => setEditing(editing === m.id ? null : m.id)}>
                    {editing === m.id ? 'ปิด' : 'แก้ไข'}
                  </Button>
                )}
              </div>
            </div>
            {editing === m.id && (
              <div className="mt-3">
                <LicenseForm idPrefix={`license-${m.id}`} initial={m}
                  onSave={async (data) => { await api.updateMemberLicense(token, m.id, data); onSaved(); }} />
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
