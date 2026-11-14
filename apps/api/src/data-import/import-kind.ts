import type { AuthUser } from '@lawfirm/shared';
import type { Prisma } from '../generated/prisma';
import type { FirmRefs } from '../common/firm-refs';
import type { RawImportRow, TemplateExtras } from '../common/excel-import/types';
import type { CasesService } from '../cases/cases.service';
import type { CaseAccessService } from '../common/services/case-access.service';
import type { CalendarService } from '../calendar/calendar.service';
import type { OutlookCalendarSyncService } from '../outlook-integration/calendar/outlook-calendar-sync.service';
import type { InvitationService } from '../saas/invitation.service';
import type { TenantService } from '../saas/tenant.service';

export const IMPORT_KINDS = ['clients', 'cases', 'tasks', 'events', 'expenses', 'time-entries', 'members'] as const;
export type ImportKind = typeof IMPORT_KINDS[number];
export type ImportDb = Prisma.TransactionClient;

export interface ImportDraft {
  rowNumber: number;
  problems: string[];
  cells: Record<string, string>;
  refs: FirmRefs;
}

export interface ImportKindDeps {
  cases: CasesService;
  caseAccess: CaseAccessService;
  calendar: CalendarService;
  outlookCalendar: OutlookCalendarSyncService;
  invitations: InvitationService;
  tenant: TenantService;
}

export interface ImportKindDef<Draft extends ImportDraft = ImportDraft, Lookups = unknown> {
  kind: ImportKind;
  label: string;
  sheet: string;
  headers: readonly string[];
  required: string[];
  help: Record<string, string>;
  canImport(user: AuthUser): boolean;
  template(lookups: Lookups, user: AuthUser): TemplateExtras;
  resolve(rows: RawImportRow[], lookups: Lookups, user: AuthUser): Draft[];
  lookups(db: ImportDb, user: AuthUser): Promise<Lookups>;
  commit(tx: ImportDb, user: AuthUser, drafts: Draft[]): Promise<{ created: number; after?: () => Promise<void> }>;
}

// The registry erases heterogeneous draft/lookup types; each definition keeps its own pair typed.
export type RegisteredImportKind = ImportKindDef<any, any>;
