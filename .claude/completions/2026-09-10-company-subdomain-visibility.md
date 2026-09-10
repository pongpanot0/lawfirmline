# Completion: company subdomain + role visibility

**Date:** 2026-09-10

## Done

- Seed/migration: firm `thesiambarristers` (The Siam Barrister); roles OWNER / SENIOR / LAWYER / ASSISTANT
- Reserved slug helpers + allocateSlug on register
- Web middleware + API tenant resolve (`X-Firm-Slug` / Host); TenantMatchGuard
- Courts + DeadlineRules global; CaseType still per-firm with defaults
- Clients / intake / email-intake role filters via CaseAccessService
- Unit tests for slug helpers, client/intake filters, deadline rules, clients, email-intake

## Env

- `ROOT_DOMAIN=samnaun.com`
- `NEXT_PUBLIC_ROOT_DOMAIN=samnaun.com`
