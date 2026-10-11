# CaseFox vs Clio: Feature Inventory

**Date:** 2026-10-11
**Scope:** All public-facing features of **CaseFox** and the **Clio suite**. The Clio suite here means Clio Manage, Clio Grow (with Grow AI and Clio Scheduler), Clio Draft, Clio Work (Vincent AI, Clio Library and Clio Docket), Manage AI (formerly Clio Duo), Clio Payments, Clio Accounting, Clio File, Clio for Clients and Clio for Co-Counsel.
**Method:** Public sources only. No product logins were used.

## Sources

| Product | Sources used |
|---|---|
| CaseFox | casefox.com feature pages: `/all-features/`, `/pricing-casefox/`, `/legal-case-management-software/`, `/legal-billing-software/`, `/legal-trust-accounting/`, `/legal-client-portal/`, `/conflict-check/`, `/legal-documents-management/`, `/legal-calendaring/`, `/legal-tasks-events/`, `/legal-time-expense-tracking/`, `/ledes-invoicing/`, `/utbms-codes/`, `/online-intake-forms/`, `/online-payments/`, `/legal-client-communication/`, `/legal-reporting/`, `/law-firm-performance-dashboard/`, `/multilingual-legal-software/`, `/custom-tagging/`, `/role-based-data-access/`, `/all-integrations/`, `/mobile-apps-for-lawyers/`, `/data-security/`. Also `llms.txt`, Capterra (4.5, about 96 reviews) and G2 (3.9, 10 reviews). |
| Clio | clio.com `/features/` and every feature sub-page linked from it, `/features/whats-new/`, `/pricing/`, `/security/`, `/work/*`, `/draft/*`. help.clio.com section and article index (Matters, Billing, Accounts, Activities, Calendars, Communications, Documents, Reports, Roles and Permissions, Security, Payments, Grow, Grow AI, Manage AI, Clio Work, Clio Accounting, Mobile). Clio API v4 reference (docs.developers.clio.com), which lists 90 resource types plus enums. |

**Legend:** ✓ = has the feature (publicly documented). ~ = partial or limited. — = not found in public sources. That does not prove the feature is absent; CaseFox's Zoho knowledge base is a client-rendered app and was mostly not indexable. ★ = most valuable or distinctive (25 features).

---

## 1. Dashboard / home widgets

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| Firm performance dashboard | Revenue, cost and profit metrics, plus staff productivity based on billable hours | ✓ Financial Dashboard | ~ (handled by Reports / AI reports) |
| Case insight dashboard | Per-case status, billing progress and outstanding amounts | ✓ | ✓ Matter dashboard |
| Client analytics dashboard | One screen summarising client info, cases and billing | ✓ | ✓ Contact dashboard |
| Personal "Today's Agenda" | Tasks due today and today's calendar events on the home page | ~ | ✓ |
| AI Actions cards | AI proposes items for approval: events captured from documents, drafted client updates, auto-generated bills | — | ✓ Manage AI |
| Matter "Catch up" widget | AI summary of recent matter activity | — | ✓ |
| Firm feed (activity stream) | Filterable feed of firm events: bills, documents, logins, permission changes and more | ~ Detailed Activity Log | ✓ |
| Customisable matter dashboard | Sections for WIP, outstanding balance, trust funds, budget, time and expenses, grants and Clio Work conversations | — | ✓ |
| Intake / marketing dashboard | Leads, ad spend, estimated value, and hired / not-hired split by channel | — | ✓ Clio Grow Dashboard |
| Reputation dashboard | Review-request performance | — | ✓ Grow |
| Global search with preview | Searches names, emails, phones, notes, addresses and custom fields, with a preview panel | ~ tag filters | ✓ |

## 2. Matters / cases

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| Matter record | Number, display/custom number, description, status (open / pending / closed), open/pending/close dates, location, client reference, practice area, responsible / originating attorney, billing method, currency | ✓ | ✓ |
| Configurable matter numbering | Firm-wide numbering scheme | — | ✓ |
| Practice areas / case categories | Categorise matters | ✓ | ✓ (40+ built-in categories) |
| ★ Matter stages + kanban board | Custom stages, visual kanban, stage change timestamp | ✓ Stages & Categories | ✓ (kanban on Signature tier and up) |
| Custom fields | Typed fields on matters and contacts (checkbox, contact, currency, date, time, email, matter, numeric, picklist, text area, text line, URL) and custom field sets | ✓ (encrypted custom fields) | ✓ |
| ★ Matter templates | Preset details, custom fields, billing preference, PI deduction order, document folder structure and task lists, with a default template | — | ✓ |
| Tags | Custom multilingual tags on cases, clients and items, with tag filters | ✓ | ✓ Matter and contact tags |
| Staff assignment | Assign attorneys and staff; responsibility tags | ✓ | ✓ |
| Case notes and comments | Internal notes on matters and contacts | ✓ | ✓ |
| Multi-client matters | Several clients on one matter, flowing through intake, document automation and billing | ~ split billing | ✓ |
| Related contacts / relationships | Link opposing party, witnesses, co-counsel and others to a matter | ✓ | ✓ |
| Case budgeting | Budget per matter with spending tracked against it | ✓ | ✓ |
| Matter permissions | Restrict a matter to users or groups | ✓ role-based | ✓ |
| Duplicate / convert / recover matters | Duplicate, convert, and recover deleted matters | — | ✓ |
| Matter transfers | Move a matter between entities / trust | — | ✓ (API) |
| ★ Personal injury module | Damages (special / general), medical records and bills by provider, liens, settlement calculator and statement | — | ✓ Clio for PI add-on |
| Legal aid / nonprofit | Grants, funding sources, eligibility calculator, grant reporting | — | ✓ |
| Safe custody (AU/UK) | Packets, locations and records for wills and deeds held | — | ✓ |
| UK legal aid rates | Civil / criminal controlled and certificated rates | — | ✓ |
| Practice-area landing kits | Marketing pages for 20+ practice areas | ✓ | ✓ |

## 3. Contacts / CRM / intake / leads

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| Contact management | Person and company records with emails, phones, addresses, DOB, title, photo, linked matters, documents, bills and transactions | ✓ | ✓ |
| Contact sync | Two-way sync with Google and Microsoft 365 | ✓ (Google contacts) | ✓ |
| Import / export | CSV import and export of clients; free migration service | ✓ (free migration) | ✓ (migration guides) |
| ★ Online intake forms | No-code drag-and-drop forms, multilingual, mobile-optimised, shareable link or embed | ✓ | ✓ Grow |
| Leads dashboard | Form submissions route to leads; approve, follow up, convert in one click | ✓ | ✓ |
| ★ Intake pipeline (kanban) | Intake / Hired / Not-hired boards with custom matter statuses and drag and drop | ~ leads list | ✓ Grow Pipeline |
| Intake automated workflows | Templates (rapid, screening, comprehensive) chaining form → status change → appointment → emails | — | ✓ Grow |
| ★ Grow AI agents | AI voice agent (answers firm phone line), website chat and email agent; screens leads for fit and conflicts, scores them, books consults, transcribes and summarises calls | — | ✓ add-on |
| Appointment booking | Self-serve booking with rules (no same-day or back-to-back bookings), Zoom links, paid consults | ~ portal appointment requests | ✓ Clio Scheduler |
| SMS appointment reminders | Up to 5 automated text reminders | — | ✓ |
| Email templates / sequences / marketing | Timed sequences and campaigns | — | ✓ Grow |
| Marketing sources / referral tracking | Attribute leads and value to channels | — | ✓ |
| Review requests | Send review requests automatically when a matter closes | — | ✓ |
| Google Local Services Ads | Manage LSA leads and spend inside Grow | — | ✓ |
| Website builder | Law-firm website templates with intake and payments | ✓ (free website on Enterprise, or a paid service) | ✓ |
| Request payment at intake | Collect consult fee or retainer from Grow | — | ✓ |
| KYC / identity checks | Know Your Client compliance | — | ✓ |

## 4. Conflict check

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| ★ Firm-wide conflict search | Scans clients, contacts and cases. Clio also scans case notes, events and communications across both Grow and Manage | ✓ | ✓ |
| Fuzzy / misspelling match | Smart matching catches typos | ✓ | ✓ Flex search vs Exact search |
| Multilingual conflict search | Search in any language or script | ✓ | — |
| Check at intake / matter creation | Run automatically while adding a client, or via "Save and run conflict check" | ✓ | ✓ |
| Conflict decision workflow | Mark each hit's conflict status, add notes, close with a go/no-go decision, generate a PDF report, link the check to a matter | ~ exportable report | ✓ |
| Conflict history and export | View past checks, export CSV | ✓ | ✓ |

## 5. Calendar & court-rule deadlines

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| Firm / user / ad-hoc calendars | Colour-coded, shareable calendars with visibility controls | ✓ | ✓ |
| Event types | Custom event types (court date, meeting and so on) | ✓ | ✓ |
| ★ Court-rules calendaring | Pick a jurisdiction and trigger; the system generates every dependent deadline and keeps it linked to the matter docket (recalculated on change) | ✓ rule-based (Pro) | ✓ hundreds of US courts |
| Recurring events | Repeating events and tasks | ✓ | ✓ |
| Reminders | Email and in-app reminders (multiple per event) | ✓ | ✓ (email, push, SMS to clients) |
| Two-way sync | Google, Outlook, iCal feeds | ✓ | ✓ |
| Time entry from event | Log billable time directly from an event | ✓ | ✓ |
| Client SMS event confirmation | Clients confirm attendance by text | — | ✓ |
| ★ AI events from documents | Extract dates from scheduling orders or notices and propose events, verified against the source | — | ✓ Manage AI |
| Statute of limitations tracking | Shown in agenda on mobile | — | ✓ |

## 6. Tasks, task lists, workflows & automation

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| Tasks | Assign, due dates, priority (high / normal / low), status (pending, in progress, in review, complete, draft), private/public | ✓ | ✓ |
| Task types and time estimates | Advanced tasks | ~ categories | ✓ |
| Task lists (templates) | Reusable checklists with relative due dates and cascading offsets (before or after, calendar or business days) | ~ | ✓ |
| Recurring tasks | Daily and weekly | ✓ | ✓ |
| Task audit log | Who changed what and when | ✓ | ✓ firm feed |
| ★ Automated workflows (Manage) | Trigger (matter created, or matter stage A→B, filtered by practice area and responsible attorney) runs an action: assign a task list, generate a document (PDF or DOCX), or apply a matter template | — | ✓ |
| Tasks to co-counsel / clients | Assign tasks to outside co-counsel or to the client in the portal | — | ✓ |
| AI-drafted tasks | Turns emails, notes and messages into tasks with assignee, due date and matter filled in | — | ✓ |
| Task reports | Progress and productivity by user | ✓ | ✓ |
| Text snippets | Abbreviation → phrase expansion | — | ✓ |

## 7. Documents

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| Document storage | Folders, categories, attach to case or vendor, storage monitoring | ✓ (10 GB+ on Pro) | ✓ unlimited |
| Versioning | Document versions | — | ✓ |
| Preview / editor | In-browser preview; Clio has a built-in document editor plus a desktop app / Clio Drive sync | ~ | ✓ |
| Full-text search | Search inside documents | — | ✓ |
| Cloud DMS integrations | Dropbox, Google Drive, OneDrive, Box | ✓ | ✓ plus iManage, NetDocuments, SharePoint |
| Document templates (merge) | Merge-field templates populated from case data | ✓ AI document templates | ✓ Manage templates |
| ★ Advanced document automation | Word documents become smart templates via AI; conditional pronoun and clause logic; document sets; multi-client support | ~ | ✓ Clio Draft |
| ★ Client questionnaires | AI-generated, branded, conditional questionnaires whose answers map to template fields | — | ✓ Clio Draft |
| Court forms library | Thousands of fillable state, local and USCIS forms with auto-populate and saved sets | — | ✓ Clio Draft |
| Template library | 900+ templates by jurisdiction; template-building service | ~ sample docs | ✓ |
| E-signature | Send for signature by email or SMS, mobile signing, notifications | — not found | ✓ (Dropbox Sign based) |
| Scan to PDF / OCR | Mobile scanner, auto-crop | — | ✓ mobile and client app |
| Combine / replace documents | Merge PDFs | — | ✓ |
| Court e-filing and e-service | File and serve, court-stamped copies returned, fees auto-expensed, AI-filled court forms (CA, TX, GA, NV, IL, VA) | — | ✓ Clio File |
| Multilingual drafting | Generate documents in any language | ✓ | ~ |

## 8. Communications

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| ★ Email filing to matter | Maildrop forwarding address per matter, Outlook add-in, Gmail extension, automated email filing | ~ Gmail / Outlook integration | ✓ |
| Send email from app | Signatures, templates, sender address | ✓ | ✓ |
| Two-way SMS | Text clients from matter; conversations saved | — | ✓ |
| Call / phone logs | Log calls with time entry; telephony integrations (Dialpad and others) | ✓ | ✓ |
| Secure encrypted messaging | Portal messaging with read timestamps | ✓ encrypted link | ✓ |
| Internal messages | Firm-internal chat | — | ✓ |
| Communication log export | Export all communications for audit | ✓ | ✓ |
| AI reply suggestions | Drafts email or SMS replies and client updates from matter activity | — | ✓ |
| Microsoft Teams / Zoom | Create a Teams team per matter; matter dashboard in Teams; Zoom links | ✓ Teams | ✓ |
| Background communication timer | Captures time on calls and messages | ✓ | ✓ |

## 9. Time tracking

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| Timers | Multiple running timers (web, mobile, desktop) | ✓ | ✓ |
| Manual / duplicate entries | Manual entry, duplicate a past entry | ✓ | ✓ |
| ★ SMS time entry | Log billable time by sending a text message | ✓ | — |
| Voice timer / dictation | Voice commands for timers and notes on mobile | — | ✓ |
| Time from email, event, task | Log time directly from Outlook / Gmail, calendar, tasks and communications | ~ | ✓ |
| AI automatic time capture | Captures work, drafts the entry and matches it to the matter | — | ✓ |
| Activity categories / descriptions | Preset activity types with rates | ✓ | ✓ |
| Rate hierarchy | User, matter, client, activity and custom rates; rate tables; rounding | ✓ | ✓ |
| Billable / non-billable | Flag entries; track non-billable work against flat-fee or contingency matters | ✓ | ✓ |
| UTBMS / ABA codes | Tag time and expenses with task and activity codes; codes can be made mandatory per matter | ✓ | ✓ |
| Fixed-fee entries | Flat-fee line items | ✓ | ✓ |
| Staff compensation rules | Fee split among team members by role or involvement | ✓ | ✓ fee allocation / originating attorney reports |

## 10. Billing / invoicing

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| Billing models | Hourly, flat, contingency, mixed | ✓ | ✓ |
| Bill themes / templates | Branded invoice designer (sections, fonts, line-item layout, logo) | ✓ | ✓ |
| ★ Bulk invoice generation | Generate hundreds or thousands of bills in one run | ✓ | ✓ |
| Recurring / auto billing | Scheduled automatic invoices | ✓ | ✓ AI drafts bills on schedule |
| Bill approval workflow | States: draft → awaiting approval → awaiting payment → paid → void | ~ | ✓ |
| ★ Split billing | Split by percentage or by time entry across payers, with rates per payer | ✓ | ✓ (Signature tier) |
| ★ LEDES e-billing | LEDES 1998B and XML 2.0, LEDES client ID, mandatory codes | ✓ (+ PDF-to-LEDES conversion service) | ✓ |
| Multi-currency | Bill in a client's currency; FX gain/loss reports | ✓ multilingual bills | ✓ |
| Multi-tax | Multiple tax rates per line; Canadian tax authorities | ~ | ✓ |
| Credit notes / write-offs / discounts | Adjust balances | ✓ | ✓ |
| Interest on late bills | Automatic interest charges | — | ✓ |
| ★ Payment profiles | Grace period, prompt-pay discount, interest rate per client | — | ✓ |
| Bill reminders | Automated overdue reminders and message templates | ✓ | ✓ |
| Bill timeline | Sent, viewed and paid audit trail | — | ✓ |
| Statement of account | Client statement of history and balance | ✓ | ✓ |
| Bulk invoice actions | Send, print, mark paid in bulk | ✓ | ✓ |
| Payment receipts | Auto receipts | ✓ | ✓ |

## 11. Trust / IOLTA accounting, retainers & payments

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| Trust and operating accounts | Multiple bank accounts with separate ledgers | ✓ | ✓ |
| Deposit / transfer / disburse / refund | One-click trust-to-operating transfer on bill payment | ✓ | ✓ |
| ★ Trust requests + evergreen retainer (with reconciliation) | Minimum-balance rule; auto-generated replenishment request after billing; low-balance alert | ✓ Trust Fund Requests | ✓ |
| Protected trust funds | Ring-fence funds that cannot be applied | — | ✓ |
| Trust reconciliation | Three-way reconciliation with reports, void and redo | ✓ | ✓ |
| Trust compliance reports | Trust ledger, trust listing, client ledger, jurisdiction-specific reports (Law Society of Alberta, NSW) | ✓ | ✓ |
| Online payments | Card, eCheck/ACH, Apple Pay, Google Pay | ✓ via LawPay / PayPal (no CaseFox fee) | ✓ native Clio Payments |
| ★ Payment links, QR codes, tap-to-pay (also on mobile) | Click-to-pay links, QR codes, tap-to-pay on phone with no hardware | ~ portal links | ✓ |
| Payment plans / Autocharge | Scheduled installments; auto-charge stored methods | ✓ recurring | ✓ |
| Pay later (BNPL) | Affirm: firm paid upfront, client pays monthly | — | ✓ |
| Surcharge settings | Pass card fees to the client | ✓ | ✓ |
| Disputes / chargebacks | Evidence upload and responses | — | ✓ |
| Trust-safe deposits | Route payments to trust or operating without commingling | ✓ | ✓ |
| Firm financing | Clio Capital | — | ✓ |

## 12. Expenses

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| Expense entries | Hard and soft costs, categories, link to case | ✓ | ✓ |
| Recurring expenses | Repeat expense entries | ✓ | — |
| Receipt attachment | Attach receipts to entries | ✓ | ✓ |
| Vendors | Vendor profiles, vendor reports | ✓ | ✓ |
| Accounts payable | Vendor bills, due dates, check printing | — | ✓ Clio Accounting |
| Multi-currency expenses | Convert at invoice time | — | ✓ |
| Filing fees auto-expensed | From e-filing | — | ✓ |

## 13. Accounting & reports

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| Income and expense ledger | Firm-wide ledger | ✓ | ✓ |
| Full GL accounting | Chart of accounts, journal entries, bank feeds, auto-categorisation, cash/accrual switch, standard financial statements | ~ P&L summary | ✓ Clio Accounting |
| QuickBooks Online / Xero sync | Sync invoices and payments | ✓ | ✓ |
| Report catalogue | CaseFox: cases, clients, contacts, bills, accounts, billable hours, unpaid invoices, staff billing, target vs. performance, vendor / event, invoice and payment, notes and logs, P&L, AI case-report template | ✓ | — |
| | Clio (from API): AR, AR aging, bank account activity, billing history, billing rate, client activity, client ledger, payments deposit / ledger / statement / sales tax / transactions, contact info, FX gain/loss, disbursement payment, fee allocation, general ledger, grant matters, invoice payments, matter, matter balance summary, matter ledger, matter productivity by user, matters by responsible attorney, originating attorney revenue, other revenue, potential trust-to-office, productivity by client / user, revenue, task productivity / progress, trust ledger, trust listing, trust management, WIP | — | ✓ |
| ★ Custom report builder | Filter, group, preview, save presets, scheduled email delivery (daily / weekly / monthly), export to PDF, XLSX, CSV, HTML or JSON | ~ filters + PDF / Excel / CSV / ZIP | ✓ |
| AI-built reports | Ask AI for profitability or productivity reports | — | ✓ |
| Staff targets | Goals vs. actual billable hours | ✓ | ~ |

## 14. Client portal

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| ★ Secure client portal | Messages, shared documents, invoices, trust statements, payments | ✓ | ✓ Clio for Clients (web + iOS / Android) |
| Appointment requests / events | Clients request appointments; see court dates | ✓ | ✓ |
| Client document upload | Upload; Clio adds a mobile scanner and Face ID login | ✓ | ✓ |
| Tasks for clients | Assign checklist items to the client | — | ✓ |
| Bulk share to portal | Share folders or many files at once | — | ✓ |
| Read receipts and audit | Timestamps when a message or document is opened; printable record | — | ✓ |
| Co-counsel portal | Share matters, tasks and documents with outside counsel | — | ✓ |

## 15. Integrations & API

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| App marketplace | Number of integrations | about 20 (LawPay, PayPal, QBO, Xero, Google Drive, OneDrive, Dropbox, Box, Google Docs, Word, Excel, Google Calendar, iCal, G-Suite, O365, Keap, Gmail, Outlook, Teams) | 250+ App Directory, Zapier, certified consultants |
| Public REST API | Documented API | — not public | ✓ v4 (90 resources), webhooks (created / updated / deleted / matter opened / pended / closed), custom actions (links inside the Clio UI) |
| Data import / migration | Migrate from other software | ✓ free migration (Timeslips converter) | ✓ guides |

## 16. AI features

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| ★ AI document generation + analysis | Draft contracts, letters and pleadings from prompts or templates, multilingual | ✓ CaseFox AI | ✓ Clio Work / Clio for Word |
| AI document analysis | Clause and risk spotting, key detail and citation extraction, downloadable summary | ✓ | ✓ Document Analyzer |
| Matter / contact AI summaries | Summary of matter state | — | ✓ |
| Natural-language assistant | Ask about matters and firm ops; create time, tasks and events by chat | — | ✓ Manage AI |
| AI billing | Draft bills, check accuracy, auto expense entries | — | ✓ |
| ★ AI legal research | Vincent AI and Clio Library: 1B+ documents, 100+ countries, citator signals, point-in-time legislation, precedent timeline | — | ✓ Clio Work |
| Docket monitoring | Real-time alerts across 1B+ US filings; docs saved to matter | — | ✓ Clio Docket |
| Skills / Memory | Saved repeatable AI procedures; remembered preferences | — | ✓ Clio Work |
| AI in Word | Draft and edit with matter context in Microsoft Word | — | ✓ Clio for Word |
| AI governance | Org-level AI opt-out, AI event log with user, IP and timestamp, region-local processing, no training on data | ~ | ✓ |
| Free public AI tool | No-login document generator / analyser on the marketing site | ✓ | — |

## 17. Mobile app

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| iOS / Android app | Cases, clients, accounts, tasks, calendar | ✓ (reviews say it is weaker) | ✓ |
| Mobile timer and expenses | Timer, expense entry | ✓ | ✓ voice control |
| Mobile invoicing | Create and send invoices, view unpaid | ✓ | ✓ |
| Mobile tap-to-pay + scanning | Accept card in person on phone; scan to PDF; AI summaries | — | ✓ |
| Mobile lead triage | Leads, opportunities, quick intake | — | ✓ |
| Push notifications / PIN | Secure access | ~ | ✓ |

## 18. Admin, permissions, security & audit

| Feature | Description | CaseFox | Clio |
|---|---|---|---|
| ★ Role-based access | Role permissions; Clio has unlimited custom roles (Signature tier) plus admin / billing / accounts / reports roles | ✓ | ✓ |
| Groups | User groups for matter permissions | — | ✓ |
| 2FA / MFA | Two-factor authentication | ✓ Pro | ✓ (push via app) |
| SSO (SAML) | Single sign-on | — | ✓ |
| Audit / activity log | Activity log; Clio also logs session IPs and device sessions | ✓ | ✓ |
| Support access consent | Support needs explicit, time-limited permission | — | ✓ |
| Certifications | ISO-certified encryption, SSL | ✓ | ✓ SOC 2 Type II, SOC 1, ISO 27001, PCI, HIPAA, GDPR, PIPEDA |
| Data residency | Choice of hosting region | — | ✓ US / CA / EU / AU |
| White-labelling | Rebrand the software | ✓ Enterprise | — |
| Multilingual UI / data | Operate in many languages (50+ countries) | ✓ | ~ (portal multilingual) |

## 19. Plans & distinctive commercial points

| Item | CaseFox | Clio |
|---|---|---|
| Tiers | Solo: free forever (4 cases, 2 users, Pro features). Pro: $45/user/month (unlimited cases, 10 GB+, 2FA, intake, custom fields, AI documents, rule-based calendar). Enterprise: $99 (white-label, free website, custom migration) | Starter → Core (AI bills, events from documents, portal) → Signature (custom roles, kanban, AI reports, multi-currency, split billing) → Elite (adds Clio Grow). Add-ons: Grow AI, Clio for Personal Injury, Clio Work, Draft, File |
| Onboarding | Free migration, onboarding, training, 24/7 support on all plans | Certified consultants, template-building service |
| Payments fee | CaseFox adds no fee (LawPay / PayPal pass-through) | Clio Payments fixed rates, included in Manage |

---

## ★ Top features (25)

1. Matter stages + kanban (both; Clio's version is richer)
2. Matter templates (Clio)
3. Personal injury module: medical records, liens, settlement calculator (Clio)
4. Online intake forms → leads (both)
5. Intake pipeline kanban (Clio Grow)
6. Grow AI voice, chat and email intake agents (Clio)
7. Fuzzy, multilingual conflict check (both; Clio adds a go/no-go decision report)
8. Court-rules calendaring (both)
9. AI events from documents (Clio)
10. Automated workflows: matter created / stage changed → task list, document or template (Clio)
11. Advanced document automation from Word (Clio Draft)
12. AI questionnaires (Clio Draft)
13. Email-to-matter filing (Clio; CaseFox partial)
14. SMS time entry (CaseFox only)
15. Bulk invoicing (both)
16. Split billing (both)
17. LEDES / UTBMS (both)
18. Payment profiles with grace period, discount and interest (Clio)
19. Evergreen trust requests + reconciliation (both)
20. Payment links, QR codes and tap-to-pay (Clio)
21. Custom report builder with schedules (Clio; CaseFox filters only)
22. Secure client portal (both)
23. AI document generation + analysis (both)
24. AI legal research + docket monitoring (Clio Work)
25. Role-based access / custom roles (both)
