# 2026-11-14 — Custom fields (cases + clients)

Branch `claude/codex-deepresearch-global-saas-fe2591`, commits da465c7d..227dfa19.

- Research: `docs/research/2026-11-14-global-saas-multi-profession-features.md`, `docs/research/2026-11-14-case-custom-fields.md` (owner decisions section).
- Plan: `docs/superpowers/plans/2026-11-14-custom-fields.md`. Mockups: `docs/design/custom-fields/`.
- Personal (creator-only) + firm fields; required firm case fields gate stage advance and create-at-later-stage; sensitive flag hides values from AI/MCP/portal; FREE = 5 fields.
- One value writer `CustomFieldValuesService.setValues`; redaction needs ALL firm defs (`listAllForFirm`), orphan `cf_` keys hidden.
- AI tools (list/create/update/archive/restore/set values) shared by MCP, LINE, in-app AI; in-app AI limited to custom-field writes, proposal → confirm (proposals held in process memory: single API instance only).
- Migrations: `20261115000000_custom_field_definitions`, `20261115010000_custom_field_source` (additive; applied locally via psql + resolve).
- Not verified: mobile on device/simulator, in-app AI confirm card with a live model.
