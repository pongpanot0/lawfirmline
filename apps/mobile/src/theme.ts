/* Hallmark · pre-emit critique: P4 H4 E4 S4 R4 V4
 * genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */
/** Palette A (2026-11-15 mockups): cool white canvas, navy masthead and controls, marigold accent for court and the active tab. */
export const colors = {
  /** Surface hierarchy: bg (paper) < surface (cards, fields) < raised (selected pills, sheets, popovers). */
  bg: '#F4F5F7',
  surface: '#FFFFFF',
  raised: '#FFFFFF',
  /** Recessed tracks behind segmented controls and disabled fields; one step below paper. */
  sunken: '#ECEEF1',
  ink: '#0F2A44',
  /** Pressed state of navy controls. */
  inkPressed: '#0A1E31',
  text: '#0F2A44',
  muted: '#5B6573',
  faint: '#5B6573',
  /** Card and control outlines; slightly warmer and darker than the old #DFE0DC so edges read on paper. */
  line: '#E3E6EA',
  /** Field outlines: inputs must read as editable, so they sit one step darker than card edges (3:1 vs surface). */
  lineStrong: '#8C939D',
  /** Row separators inside a card. */
  divider: '#EEF0F3',
  soft: '#F0F2F5',
  accent: '#F5A524',
  accentInk: '#8A5A00',
  accentSoft: '#FFF1D1',
  good: '#0E6E4F',
  goodSoft: '#E7F4EE',
  warn: '#C4262B',
  warnSoft: '#FFF1F1',
  info: '#2F5677',
  infoSoft: '#EAF0F6',
  /** Edges for tinted chips and notices: the same hue as the fill, about 30% stronger. */
  accentEdge: '#F7D58F',
  warnEdge: '#F6CACA',
  goodEdge: '#BFE0D1',
  infoEdge: '#C9D7E5',
  /** Navy-tinted backdrop behind modal sheets and the calendar picker. */
  scrim: 'rgba(15,42,68,0.45)',
  /** Marigold fill under the active tab and court highlights; icon strokes on it use accentIcon. */
  accentIcon: '#B87400',
  /** Count badges (tab bar, bell): solid red with white text, 4.8:1. */
  badge: '#D92D20',
  /** Text and icons on the navy masthead. */
  onInk: '#FFFFFF',
  onInkMuted: 'rgba(255,255,255,0.72)',
  /** Round buttons sitting on the masthead. */
  inkRaised: 'rgba(255,255,255,0.12)',
} as const;

/**
 * Anuphan carries headings and numbers (the mockups' display face); body text
 * stays on the system font, which renders Thai well on both platforms.
 */
export const fonts = {
  semibold: 'Anuphan_600SemiBold',
  bold: 'Anuphan_700Bold',
} as const;

/**
 * sm: tags · md: fields and pickers (8px, per design.md) · action: buttons (10, the Stitch reference) · lg: cards · xl: sheets.
 * `card`/`pill`/`button` keep the old names.
 */
export const radius = { sm: 6, md: 8, action: 10, lg: 12, xl: 16, card: 12, pill: 6, button: 8, full: 999 } as const;
/** design.md 4/8/12/16/24/32/48 scale. */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/**
 * Elevation: navy-tinted, low-opacity shadows (design.md "restrained shadows").
 * `boxShadow` is cross-platform on the new architecture (iOS, Android, web), so one value serves all three.
 * sm: resting cards and primary buttons · md: pressed-up/selected surfaces, sticky bars · lg: sheets and dialogs.
 */
export const shadow = {
  /** An explicit empty list, so spreading it after sm/md actually clears the shadow (e.g. on press). */
  none: { boxShadow: [] as ReadonlyArray<never> },
  /** Whisper shadow: cards are borderless white on the cool canvas. */
  sm: { boxShadow: '0px 1px 2px rgba(15, 42, 68, 0.05), 0px 2px 8px rgba(15, 42, 68, 0.05)' },
  md: { boxShadow: '0px 2px 4px rgba(15, 42, 68, 0.06), 0px 4px 12px rgba(15, 42, 68, 0.08)' },
  /** Sticky bottom action bars: the shadow falls upward onto the scrolling content. */
  bar: { boxShadow: '0px -1px 0px rgba(15, 42, 68, 0.04), 0px -4px 12px rgba(15, 42, 68, 0.07)' },
  lg: { boxShadow: '0px 8px 24px rgba(15, 42, 68, 0.14), 0px 2px 6px rgba(15, 42, 68, 0.08)' },
  /** Focus ring drawn outside a focused field's border (does not shift layout). */
  focus: { boxShadow: '0px 0px 0px 3px rgba(15, 42, 68, 0.16)' },
  /** Same ring in the warning hue, for a focused field that has an error. */
  focusWarn: { boxShadow: '0px 0px 0px 3px rgba(196, 38, 43, 0.16)' },
} as const;

/** Type ramp (sizes before the in-app text scale, which AppText applies). */
export const typeScale = {
  display: { fontSize: 26, lineHeight: 36, fontFamily: 'Anuphan_700Bold' },
  title: { fontSize: 20, lineHeight: 30, fontFamily: 'Anuphan_700Bold' },
  section: { fontSize: 17, lineHeight: 26, fontFamily: 'Anuphan_700Bold' },
  body: { fontSize: 15, lineHeight: 24 },
  meta: { fontSize: 13, lineHeight: 20 },
  /** Small muted label above a value or group. No letter-spacing: it breaks Thai stacked marks. */
  overline: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  stat: { fontSize: 30, lineHeight: 38, fontFamily: 'Anuphan_700Bold' },
} as const;

/** Shared control metrics: every single-line field and picker uses the same height. */
export const control = { height: 48, borderWidth: 1, focusBorderWidth: 2, errorBorderWidth: 1.5, padding: 12 } as const;

/** Leading icon tiles on list rows, disclosures and empty states. */
export const iconTile = { sm: 36, md: 40, lg: 56 } as const;

export const pageContent = {
  width: '100%',
  maxWidth: 1080,
  alignSelf: 'center',
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.lg,
  paddingBottom: spacing.xl,
} as const;

// Gap-based forms already separate siblings; avoid adding the label's bottom margin twice.
export const formLabelSpacing = { marginTop: spacing.sm, marginBottom: 0 } as const;

/** Minimum comfortable one-hand tap target. */
export const TOUCH = 44;

/**
 * OS font-scale cap for fixed-size chrome (tags, badges, chips, tab labels).
 * The in-app text size preference still applies on top; body text stays uncapped.
 */
export const CHROME_MAX_SCALE = 1.3;
