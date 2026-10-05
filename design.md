# Samnuan: Editorial Juris

Locked for the full redesign: user selected directions 2 + 3 and confirmed every page on 5 October 2026.

Scope: all 79 web pages and 41 native screens in [the inventory](docs/design/2026-10-05-redesign/inventory.md). Shared components own the system; pages retain routes, permissions, data, forms and recovery behavior.

## Visual system

- Genre: modern-minimal. Staff app: Workbench. Public site and policy content: Long Document.
- Paper cream, navy ink and a permanently navy navigation rail. Staff dark mode uses navy canvas and cream text. Public, account and client surfaces use paper cream.
- Brass appears only in identity and court emphasis. Status always includes text.
- Upright Trirong for wordmark and major web headings; Noto Sans Thai for content, with Inter/system fallbacks. Native keeps installed Anuphan headings and system body.
- Compact title, useful description, visible next action, then records. Counts belong to real data. Tables scroll inside their container; phones favor record rows.
- Hairline divisions, 8px controls, restrained shadows. No decorative statistics or gradients, invented shortcuts, security claims or mock data in app screens.
- Spacing: 4/8/12/16/24/32/48/64/80/96/128px. Targets at least 44px; Thai titles wrap. Readable prose measure.
- Existing empty, loading, error and disabled behavior remains. Hover, focus, pressed and reduced-motion states are styled.

## Tokens and exports

Canonical CSS and shadcn HSL aliases: [tokens.css](tokens.css). Light text contrast 12.73:1, muted 6.30:1; dark text 15:1, muted 8.02:1. Native mirrors these values in `apps/mobile/src/theme.ts`.

Tailwind v3 export (the existing app consumes these aliases):

```js
{ colors: { background: 'hsl(var(--background))', foreground: 'hsl(var(--foreground))',
  primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
  card: 'hsl(var(--card))', border: 'hsl(var(--border))' },
  fontFamily: { sans: ['var(--font-sans)'], display: ['var(--font-display)'] },
  borderRadius: { lg: 'var(--radius)' } }
```

Portable DTCG export (sRGB; dark values in CSS):

```json
{"paper":{"$type":"color","$value":{"colorSpace":"srgb","components":[0.968627,0.956863,0.929412],"alpha":1}},"surface":{"$type":"color","$value":{"colorSpace":"srgb","components":[1,0.992157,0.980392],"alpha":1}},"ink":{"$type":"color","$value":{"colorSpace":"srgb","components":[0.078431,0.180392,0.262745],"alpha":1}},"brass":{"$type":"color","$value":{"colorSpace":"srgb","components":[0.545098,0.427451,0.196078],"alpha":1}},"controlRadius":{"$type":"dimension","$value":{"value":8,"unit":"px"}}}
```

## Provenance and acceptance

[Google Stitch project](https://stitch.withgoogle.com/projects/394194744767221958) supplies composition references; existing functionality determines implementation. Generated serif body text is replaced with readable Thai sans text.

Verify staff, client, authentication and public families at 320/375/414/768px and desktop, and native layout/font scaling separately. Browser previews are not device or production evidence. Actual checks and coverage live beside the inventory.
