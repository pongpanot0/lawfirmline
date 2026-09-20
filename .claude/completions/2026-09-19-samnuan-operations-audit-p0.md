# Samnuan Operations Audit — P0 fixes (2026-09-19)

Audit score before fixes: 48.5/100 (Office Operations band). Full scorecard in session transcript.

## Shipped (branch claude/samnuan-operations-audit-b76990)
- Migration `20260922000000_ops_audit_p0`: DocumentTemplate.firmId, OnHoldCategory enum + TaskOnHold.category, CaseStatusLog, IntakeChecklistItem, PlaybookRelease.caseTypeId
- Security: template firm scoping, task filter firm scoping (all roles), audit log for login + document upload/version/download/visibility + case owner change, intake checklist persisted server-side
- Backup: scripts/backup.sh + .github/workflows/backup.yml (nightly 02:00 BKK via SSH; **scripts/backup.sh must exist in EC2_APP_DIR on the host**; restore test still manual/quarterly)
- Escalation scheduler (08:30 BKK): due-tomorrow→assignee, overdue≥1d→+lead, ≥3d→+owners; on-hold nextFollowUpAt chaser (re-arms +7d)
- /operations/case-health (by status, inactive>14d, stuck>30d) + web tab; capacity band on workload; playbook caseType binding + assigneeRole per step; KpiCard href drill-down

## P1 shipped (commit 019fda9, same PR #44)
- SLA config per firm (/operations/sla) driving case-health thresholds
- Team performance metrics + operations tab
- SOP module + /sops page; DocumentTemplate CRUD (owner-only)
- Required documents: CaseType.requiredDocuments + Document.category + missing-doc alert
- AutomationLog (escalation, playbook apply, insurance stage) + list API

## P2 shipped (PR #47)
- Recurring tasks (recurrenceDays, spawn on DONE), task dependencies (blockedById + unlock notify), cross-case doc search, seat-limit enforcement, S3 SSE, migration-history hotfix (20260922040000 category collision — prod deploy would have failed)
- Archive = CaseStatus.ARCHIVED (shipped in #45); skipped per-firm LINE channel (single LINE tenant, premature)

## Remaining backlog
- Per-firm LINE channel (when second firm needs LINE), retention auto-purge policy, client portal extras, advanced BI
