# 2026-11-14 — Excel import for every data type

Branch `claude/eager-perlman-de8c02`. Commits 620634db, 196f2a04, 01a9514f.

- API `apps/api/src/data-import/`: `GET /data-import/kinds`, `GET /:kind/template` (Thai .xlsx), `POST /:kind/preview` (stores `DataImportBatch` with `kind`), `POST /batches/:id/commit` (one Serializable tx with the Firm row locked, all-or-nothing, re-resolves the stored rows), `GET /batches` (history).
- Kinds: clients, cases, tasks, events, expenses, time-entries, members. References resolve inside the firm and the importer's case access; `assertFirmRefs` runs again before writing.
- Shared reader and template builder in `common/excel-import/`; `/case-import` keeps its behaviour.
- Migration `20261114120000_data_import_kind` (applied locally via psql + migrate resolve).
- Web `/import` page, sidebar entry, link from `/cases/import`.
- Plan-limit coordination: the `cases` kind calls `assertCanOpenCases` once for all open rows before writing; rename that call when `assertCanAddCases` lands.
- Known ceilings: zip-bomb check trusts declared zip sizes (same as case-import). Imported court dates don't fire deadline rules (on purpose, for history).
