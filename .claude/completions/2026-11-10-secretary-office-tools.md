# AI secretary: office/admin tools (2026-11-10)

Secretary chat (`apps/api/src/secretary/secretary-tools.service.ts`) gained 5 read-only tools:
`list_leaves`, `search_sops`, `lawyer_licenses` (all members; licences = own only unless `runOperations`),
`receivables` (`manageInvoices`, reuses `CollectionsService.getReceivables`), `petty_cash_balance` (`viewPettyCash`, findUnique — never upserts).

- `definitions(user)` now filters by capability; `run()` re-checks (returns `forbidden`).
- `BillingModule` exports `CollectionsService`; `SecretaryModule` imports it (forwardRef).
- No new cards: office tools return `cards: []` (add SecretaryCard types + web/mobile rendering if wanted).
- Tests: `secretary-tools.service.spec.ts` (+7).
