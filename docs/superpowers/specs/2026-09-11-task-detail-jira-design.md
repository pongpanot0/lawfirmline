# Task detail (Jira-style) — design

Date: 2026-09-11 · Scope: `/todos` (งานส่วนตัว) and case tasks (`/cases/[id]?tab=tasks`)

## Goal

Turn a task from a Kanban card with three fields into a work item a firm can run
a matter on: subtasks, assignee, deadline, priority, labels, file attachments and
a comment thread, all opened from the board without leaving it.

## What already exists (reused, not rebuilt)

- `Task` model with `assigneeId`, `dueDate`, `description`, five-state `status`,
  lawyer↔senior handoff/review (`TaskAssignmentLog`), on-hold (`TaskOnHold`).
- `KanbanBoard` component shared by `/todos` and the case tasks tab.
- `FileStorageService` (`UPLOAD_DIR`, S3-compatible key API) and the
  `IntakeAttachment` upload/delete pattern (10 MB multer limit).
- `todos.controller` (`/todos/*`) and `tasks.controller` (`/cases/:caseId/tasks/*`)
  both delegate to `TasksService`.

## Data model (Prisma)

```prisma
enum TaskPriority { LOW MEDIUM HIGH }

model Task {
  // existing fields …
  parentId  String?
  priority  TaskPriority @default(MEDIUM)
  labels    String[]     @default([])

  parent      Task?            @relation("TaskSubtasks", fields: [parentId], references: [id], onDelete: Cascade)
  subtasks    Task[]           @relation("TaskSubtasks")
  attachments TaskAttachment[]
  comments    TaskComment[]

  @@index([parentId])
}

model TaskAttachment {
  id           String   @id @default(uuid())
  taskId       String
  filename     String
  storagePath  String
  mimeType     String
  size         Int
  uploadedById String
  createdAt    DateTime @default(now())
  task       Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  uploadedBy User @relation("TaskAttachmentUploader", fields: [uploadedById], references: [id])
  @@index([taskId])
}

model TaskComment {
  id        String   @id @default(uuid())
  taskId    String
  authorId  String
  body      String   @db.Text
  createdAt DateTime @default(now())
  task   Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author User @relation("TaskCommentAuthor", fields: [authorId], references: [id])
  @@index([taskId, createdAt])
}
```

Rules
- A subtask is a `Task` with `parentId`; it inherits `caseId` from its parent and
  cannot itself have subtasks (one level, like Jira sub-tasks).
- Deleting a parent deletes its subtasks, attachments and comments (DB cascade).
- `labels` are free text, trimmed, unique per task, max 10, max 30 chars each.
- One migration: `add_task_detail_fields` (enum, columns, two tables, indexes).
  Existing rows get `priority = MEDIUM`, `labels = []`, `parentId = NULL`.

## API

New `TaskDetailController` at `/tasks/:taskId` (JWT guard), serving both task
kinds. Access rule per request, in `TasksService.assertAccess(taskId, user)`:
- case task (`caseId` set) → existing `ensureCaseMembership`;
- standalone task → existing `assertStandaloneOwnership` (creator, assignee, or
  owner/senior of the firm, as today).

| Method | Route | Body / result |
|---|---|---|
| GET | `/tasks/:id` | `TaskDetail`: task + `parent {id,title}`, `subtasks[]` (id, title, status, assignee, dueDate, priority), `attachments[]`, `comments[]` (with author), `assignmentLogs[]`, `case {id, ownRef, title}` |
| POST | `/tasks/:id/subtasks` | `{ title, assigneeId?, dueDate?, priority? }` → the new subtask; 400 if `:id` is itself a subtask |
| POST | `/tasks/:id/attachments` | multipart `file` (≤10 MB; pdf, images, docx, xlsx, txt) → `TaskAttachment` |
| GET | `/tasks/:id/attachments/:attachmentId/download` | streams the file with original filename |
| DELETE | `/tasks/:id/attachments/:attachmentId` | uploader or firm owner only |
| POST | `/tasks/:id/comments` | `{ body }` (1–4000 chars) → comment with author |
| DELETE | `/tasks/:id/comments/:commentId` | author or firm owner only |

Changes to existing endpoints
- `CreateTaskDto` / `UpdateTaskDto` gain `priority?` and `labels?: string[]`.
  `PATCH /todos/:id` and `PATCH /cases/:caseId/tasks/:id` already accept
  `title/description/assigneeId/dueDate/status`, so the drawer edits through them.
  A subtask is patched through the same routes (it is a Task).
- `GET /todos` and `GET /cases/:caseId/tasks` return only top-level tasks
  (`parentId: null`) and add `priority`, `labels`, `subtaskCount`,
  `subtaskDoneCount`, `attachmentCount`, `commentCount` to each item.
- `findMine` includes subtasks assigned to me under "mine" scope? **No** — the
  board shows parents only; a subtask assigned to me is reachable via My Day
  (which already lists tasks by due date) and the parent's drawer. Keeping the
  board parent-only is what makes it readable.

Not in scope: notifications on comment, mention (@), moving a subtask between
parents, reordering.

## Web

### `TaskDetailDrawer` (`components/tasks/TaskDetailDrawer.tsx`)
Right-side sheet (full-screen on mobile), controlled by the `task` search param
(`/todos?task=<id>`, `/cases/<id>?tab=tasks&task=<id>`), so a task URL is
shareable and the back button closes it. Loads `GET /tasks/:id`; every edit
calls the API then refetches the detail and asks the page to reload its list.

Sections, top to bottom
1. Header: inline-editable title; status select (same transitions the card
   allows); case link (`ownRef`) when case-bound; close button.
2. Fields grid: priority (3 chips), assignee (select of firm users), due date,
   labels (chip input: type + Enter, × to remove).
3. Description: textarea with save.
4. Subtasks: checklist — checkbox toggles `DONE`/`TODO`; each row shows
   assignee initials + due date; "เพิ่มงานย่อย" inline input (title only;
   assignee/due editable after by opening the subtask itself in the same drawer,
   with a "← กลับไปงานหลัก" link).
5. Attachments: drop zone / file picker, list with name, size, uploader,
   download and delete.
6. Comments: list (author, relative time, body) + textarea "บันทึกความคืบหน้า".
7. History: existing `assignmentLogs` rendering moved here from the card.

### Board and create form
- `KanbanBoard` card: title click → `onOpen(taskId)`; left border colour by
  priority (HIGH red, MEDIUM none, LOW muted); label chips (max 3 + "+n");
  counters row `☑ 2/5 · 📎 3 · 💬 1` shown only when non-zero.
- Quick-create form on `/todos` and the case tab adds a priority select; the
  rest stays quick (title, assignee, due).
- `api.ts`: `TaskItem` gains the new fields; new `TaskDetail`,
  `TaskAttachmentItem`, `TaskCommentItem` types and functions
  `getTaskDetail`, `createSubtask`, `uploadTaskAttachment`,
  `deleteTaskAttachment`, `taskAttachmentDownloadUrl`, `addTaskComment`,
  `deleteTaskComment`.
- i18n (`dashboard.ts` th/en): `taskDetail.*` keys for every label above.

## Error handling
- Upload: reject over-limit/unknown types with a 400 message the drawer shows
  inline next to the drop zone; a failed upload never leaves an orphan row
  (write the DB row only after `fileStorage.put` succeeds; delete the file if
  the row insert fails).
- Access: 403 from `assertAccess` renders "ไม่มีสิทธิ์ดูงานนี้" in the drawer
  and clears the `task` param.
- Concurrent edits: last write wins (as today); the drawer refetches after each
  save so the user sees the server state.

## Testing
- `tasks.service.spec.ts`: subtask inherits `caseId` and rejects nesting;
  list endpoints exclude subtasks and return counts; `assertAccess` for
  standalone vs case tasks; comment/attachment delete permission.
- `task-detail.controller.spec.ts`: upload validation (size/mime) and
  download headers.
- Web: `case-costs`-style node test for the label parser (trim/dedupe/limits);
  browser walk-through of open-drawer → add subtask → upload → comment on both
  `/todos` and a case tab, desktop and 375 px.
