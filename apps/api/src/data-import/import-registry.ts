import type { ImportKindDeps, RegisteredImportKind } from './import-kind';
import { clientsKind } from './kinds/clients.kind';
import { casesKind } from './kinds/cases.kind';
import { tasksKind } from './kinds/tasks.kind';
import { eventsKind } from './kinds/events.kind';
import { expensesKind } from './kinds/expenses.kind';
import { timeEntriesKind } from './kinds/time-entries.kind';
import { membersKind } from './kinds/members.kind';

export const createImportRegistry = (deps: ImportKindDeps): RegisteredImportKind[] => [
  clientsKind(deps), casesKind(deps), tasksKind(deps), eventsKind(deps),
  expensesKind(deps), timeEntriesKind(deps), membersKind(deps),
];
