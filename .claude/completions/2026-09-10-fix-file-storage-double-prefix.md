# Completion: Fix intake attachment File not found

**Date:** 2026-09-10  
**Symptom:** `IntakePrecedentAnalysisService` WARN `Failed to extract attachment text: File not found`

## Cause

`FileStorageService.put()` stored `path.join(UPLOAD_DIR, key)` → `uploads/intake/...` in DB.  
`getBuffer()` then joined `UPLOAD_DIR` again → looked for `uploads/uploads/...`.

## Fix

- `put()` now returns the relative key only (same as S3).
- `toLocalPath()` strips a legacy `uploads/` / `./uploads/` prefix before joining, so existing DB rows still resolve.
- Unit tests cover put/get and legacy path shapes.
