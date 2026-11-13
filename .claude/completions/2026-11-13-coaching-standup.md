# Coaching + daily standup (2026-11-13)

- Manager coaching notes: AI draft only on button press, nothing saved until "ส่งคำแนะนำ"; client names redacted; usage logged (`coaching_draft`).
- Daily standup ("เช็กอินเช้านี้") for LAWYER/SENIOR_LAWYER, Mon–Fri Bangkok, skips leave + public holidays; 08:30 push, deduped per firm/user/day.
- Radar: friendlier UI, coaching cues + everyone's standup state only for `runOperations`; others see only their own standup.
- Coaching/standup task reads use the viewer's case ACL (`getCaseFilterForUser`).
- Migration `20261113210000_coaching_standup` (additive). Spec + approved mockups: `docs/superpowers/specs/2026-11-13-coaching-standup-contract.md`, `docs/superpowers/specs/coaching-mockups/`.
- Known residual: name redaction is exact-match against firm records (same as other AI features); scheduler has no catch-up if the API is down at 08:30.
