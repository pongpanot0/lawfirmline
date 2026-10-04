# Samnuan Balance logo

Approved on 4 October 2026: the original **02 / Balance** concept in the supplied screenshot. The selected mark combines an S, a central upright and two balanced terminals. The serif uppercase SAMNUAN wordmark is preserved. This selection supersedes the arrow and workflow-dot explorations.

## Production assets

| File under `apps/web/public/brand/` | Use | Dimensions | Size |
| --- | --- | --- | --- |
| `samnuan-balance-mark.png` | Transparent navy mark for the landing header and footer | 256 × 256 | 28,782 bytes |
| `samnuan-balance-icon.png` | White mark on a navy tile for shared web branding and Apple icon | 256 × 256 | 52,011 bytes |
| `samnuan-balance-favicon.png` | Browser tab icon | 32 × 32 | 2,143 bytes |

Created with the built-in imagegen tool using the user-approved screenshot as the reference, then resized and encoded as PNG for web delivery. The original assets remain available under their old filenames. The wordmark is live text using Georgia with a Times New Roman fallback.

## Image prompts

**Mark:** Precisely extract the approved original Balance S monogram. Preserve the curves, central upright and balanced upper-right/lower-left terminals. Render one navy `#142E43` symbol on true alpha transparency; remove labels, text, tiles and other copies. No arrows, workflow dots, redesign, shadows or metallic effects.

**Icon:** Precisely reproduce the approved rounded-square app icon: the same original Balance monogram in white on navy `#142E43`, centered with transparent space outside the rounded corners. No arrows, dots, typography, captions, shadows or redesign.

## Integration and verification

- Shared `SamnuanLogo` supports the transparent horizontal lockup and the navy app icon.
- Landing header and footer use the horizontal lockup; landing actions and dark sections use the approved navy palette.
- Root metadata points to the new favicon and Apple icon.
- Shared package build and web TypeScript check passed.
- Verified the rendered landing page locally at 1280 pixels and the mobile layout at 375 pixels: new marks loaded, document width fit the viewport, menu opened and closed, Thai/English switched, and trial navigation reached its section.
- Verified the footer logo visually. This change has not been deployed.
