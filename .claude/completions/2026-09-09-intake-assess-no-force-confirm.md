# Completion: Make field-proposal confirmation advisory

**Date:** 2026-09-09

## Change
Field proposals from email intake stay visible for review, but no longer block:
- `IntakeService.assess()` (บันทึกผลการประเมิน / รับเข้าพิจารณา)
- Email-intake CTA (`ยืนยันข้อมูลและรับเข้าพิจารณา`) — button enabled even with outstanding proposals; soft amber hint remains

## Removed
- `assertFieldProposalsResolved` in intake service
- `assertReadyForAcceptance` in email-intake service (+ unit tests)

## Verify
`npx jest --config jest.config.js src/email-intake/email-intake.service.spec.ts src/intake/intake.service.spec.ts` — 30 passed
