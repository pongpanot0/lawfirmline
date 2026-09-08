# Identifiers are removed before any text reaches a third-party model

Every AI feature in the product sends case text to OpenAI in the United States: the precedent analysis (`intake-precedent-analysis.service.ts`), the document summary (`document-intelligence.service.ts`) and the notice draft (`intake.service.ts`). The precedent analysis also stored the extracted attachment text verbatim in `IntakePrecedentAnalysis.extractedFacts`, a JSON column returned in full by every read of that record.

That text is a scan of the client's own paperwork. Today it carries national ID numbers and phone numbers; once the product takes medical cases it carries hospital numbers and medical records, which are sensitive personal data under PDPA มาตรา 26 rather than ordinary personal data. `pii.ts` already states the rule for this codebase — anything leaving the database is masked — and the AI paths were the one place ignoring it.

**Decision: `redactForAi` runs at each boundary, before the text is stored or sent.** Direct identifiers (national ID, Thai phone, email, hospital/admission number, passport) are replaced by a typed placeholder such as `[เลขประจำตัวประชาชน]`. Everything a lawyer reasons with — dates, amounts, case numbers, statute sections, party names — passes through untouched. What was removed is tallied into `extractedFacts.redaction` as evidence.

**`maskPiiText` was not reused, deliberately.** It guards logs, where losing a date costs nothing, so it masks any long run of digits: `2026-09-07` becomes `****0907`. Applied to case facts it destroys the incident date, and with it any reasoning about the limitation period — while still letting `HN 6512345` through, because seven digits fall under its phone threshold. The two jobs want opposite trade-offs, so they are separate functions with separate tests.

**Party names are kept on purpose.** The opposing party is the subject of the analysis; removing it would make precedent search useless, and a company name is not what makes a natural person findable.

## What this does not do

Data minimisation is one requirement among several. Still open, and all business decisions rather than code:

- **Cross-border transfer (มาตรา 28/29).** Redacted or not, the transfer to a US processor needs a lawful basis on file. This reduces what crosses the border; it does not by itself make the crossing lawful.
- **A processing agreement with OpenAI (มาตรา 40)**, including whether zero-retention applies to the account in use.
- **Basis for sensitive data (มาตรา 26)** before any medical case is analysed — whether the firm relies on the legal-claims exemption or on explicit consent.
- **Third parties inside the records** — the treating doctor, other patients named in a medical file — who never dealt with the firm.
- **Retention.** The original file still sits at `attachment.storagePath` unredacted, correctly: the firm is the controller of its own case file. Nothing yet expires it.

Redaction is not reversible and is pattern-based. It will miss an identifier written in a shape the rules do not cover, so it lowers exposure rather than eliminating it, and is not a substitute for the items above.
