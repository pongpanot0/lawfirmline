# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (plus a separate native app in apps/mobile)

## Users

- **Buyers:** owners and senior partners of small to mid-sized Thai law firms, and solo lawyers who run their own practice (confirmed 2026-11-15).
- **Daily users:** lawyers, paralegals and office staff of those firms. Lawyers often check the product on a phone while at court.
- **Secondary audience:** the firm's clients, who view their case status through the client portal and never pay for a seat.

## Product Purpose

Samnuan (สำนวน) is case and office management for Thai law firms: cases and documents, court calendar and deadlines, team work assignment, the client portal, and billing. Success means a firm stops tracking court dates in notebooks or personal calendars, stops answering the same client status questions, and bills from the system instead of Word/Excel.

## Positioning

Built for Thai courts and Thai law, which foreign tools (Clio, ClickUp, PracticePanther) are not:
court-deadline suggestions that count Thai public holidays; court fees from the table in the Civil Procedure Code; invoices with Thai VAT classes (litigation exempt, advisory 7%) and withholding tax; client updates over LINE; prices in baht. This is the one point every public page leans on (confirmed 2026-11-15).

## Operating Context

- Court days: lawyers move between courts and check the next hearing and the case details on a phone.
- Thai office reality: schedules in notebooks, group chats in LINE, invoices in Word/Excel.
- AI features are user-invoked only: a person presses the button and confirms before anything is saved. Nothing runs AI automatically.

## Capabilities and Constraints

- Feature facts for public pages are in [docs/seo/2026-11-15-landing-pages-fact-sheet.md](docs/seo/2026-11-15-landing-pages-fact-sheet.md). Plan names, prices and seat counts come from `PLAN_CONFIG` at build time and are never hard-coded.
- Not supported today, so never claim it: online payment collection, e-Tax Invoice, automatic invoicing (milestones notify, people invoice).
- Unverified, so never claim it until checked: sending invoices over LINE; which plan gates LINE client notifications.
- Deadline features **suggest** dates for a lawyer to confirm. Legal content carries a "general information, not legal advice" line.

## Brand Commitments

- Name: Samnuan / สำนวน. Thai-first copy, English secondary (TH/EN switch).
- Existing visual system is locked in [DESIGN.md](DESIGN.md) (Editorial Juris, 5 Oct 2026).

## Evidence on Hand

None that can be published yet: no testimonials, customer logos, usage numbers or reviews (confirmed 2026-11-15). Public pages use real product screenshots and real features only.
