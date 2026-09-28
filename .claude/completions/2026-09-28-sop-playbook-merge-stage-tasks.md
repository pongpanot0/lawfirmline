# SOP + Playbook merge, stage-task proposals on any channel — 2026-09-28

PR: pongpanot0/lawfirmline#81 · Spec: `docs/superpowers/specs/2026-09-28-sop-playbook-merge-stage-tasks-design.md`

- `Case.stageTasksHandledFor` (migration `20260929120000_case_stage_tasks_handled`, backfill = stage) drives a case-page banner that offers playbook stage tasks whenever stage ≠ handled. Create/skip both mark handled.
- `POST /practice-setup/cases/:caseId/stage-tasks/dismiss`. `proposeStageTasks` dedupes by title against all case tasks.
- `/sops` lists plain SOPs + playbooks (⚡). `/playbooks` is the owner-only editor (`?id=`, `?new=1`). Sidebar Playbook entry removed.
- Not done: playbook steps creating deadlines/court dates; banner on mobile.
