# Spec: OFFICE_MANAGER firm role (2026-10-11)

Research and journey: [docs/research/2026-10-11-office-manager-journey.md](../../research/2026-10-11-office-manager-journey.md)

## Problem
The firm is hiring a non-lawyer to run the office. No existing `FirmRole` fits:
- ASSISTANT has no office powers.
- OWNER has every power.

## Decisions (from the firm owner, 2026-10-11)
1. **Sees documents.** The office manager sees every case in the firm, including documents. Case scope is the same as OWNER.
2. **Records payments.** Full invoice and collections work: firm invoice list, print, mark sent, record payment, remind, follow-up, receivables, finance summary.
3. **Cannot approve reimbursements.** The office manager cannot approve, reject or pay expenses and expense claims, cannot issue cash advances, and cannot see other people's expenses or advances.
4. **Invites up to SENIOR_LAWYER.** The office manager can invite SENIOR_LAWYER, LAWYER, ASSISTANT or EXTERNAL. They cannot invite OWNER or OFFICE_MANAGER, change roles, or remove members.

## Capabilities

The office-power checks of the form `firmRole === OWNER` are replaced by one shared capability map in `packages/shared`. API, web and mobile all ask the same question: `hasFirmCapability(role, cap)`.

| Capability | OWNER | OFFICE_MANAGER | Covers |
|---|---|---|---|
| `viewAllCases` | ✓ | ✓ | Firm-wide case, intake, client, calendar and email-thread visibility; documents; any task in the firm |
| `manageInvoices` | ✓ | ✓ | Firm and standalone invoices, print data, send, payments, reminders, collections, receivables, finance summary, owner worklist |
| `viewPettyCash` | ✓ | ✓ | Petty-cash balance (read only) |
| `approveLeave` | ✓ | ✓ | Pending leave queue, approve/reject, cancel another person's leave, receive new-leave notifications |
| `inviteMembers` | ✓ | ✓ (capped by `canInviteFirmRole`) | Invite, list members, list/cancel invitations |
| `runOperations` | ✓ | ✓ | Daily work board, operations KPIs/SLA/health |
| `viewFirmReports` | ✓ | ✓ | Firm-scope reports and dashboard, audit log, AI usage summary |
| `manageFirmContent` | ✓ | ✓ | SOPs, document templates, case types, practice setup/imports/getting-started, annual client reports, document visibility/publication, contact case access, client-portal invites |
| `approveExpenses` | ✓ | – | Approve/reject/pay expenses and claims; firm-wide expense list |
| `issueCashAdvance` | ✓ | – | Issue cash advances (web and LINE); see other people's advances |
| `manageMembers` | ✓ | – | Change role, remove member, legacy `/users` CRUD |
| `manageSubscription` | ✓ | – | SaaS billing/subscription, firm settings |
| `deleteCase` | ✓ | – | Soft-delete a case |
| `reassignCaseLead` | ✓ | – | Change lead lawyer / case staffing |

Further rules:
- **Rank:** `FIRM_ROLE_RANK[OFFICE_MANAGER] = 2`, the same as SENIOR_LAWYER. An office manager can therefore assign tasks to LAWYER, ASSISTANT and EXTERNAL.
- **Reviewer eligibility is unchanged.** Only OWNER and SENIOR_LAWYER can be reviewers, because review is legal judgment.
- **Leave auto-approval stays OWNER-only.** An office manager cannot self-approve their own leave.
- **Label:** Thai "ผู้จัดการสำนักงาน", English "Office manager".

## Non-goals (this round)
- Blocking legal write routes (`@Roles(ADMIN, LAWYER)`) for the office manager. They can open, close and comment on cases like a lawyer. Revisit if the firm asks.
- The `/office` home page, firm-wide non-case calendar events, a `jobTitle` field, and owner approval for `/join` links. Each one is a separate follow-up.

## Security fix bundled in
`GET /ai-usage/summary` currently returns firm-wide data to any member. It becomes `viewFirmReports`.
