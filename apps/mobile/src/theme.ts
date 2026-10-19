/* Hallmark · pre-emit critique: P4 H4 E4 S4 R4 V4
 * genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */
/** Editorial Juris: paper cream, navy controls; mirrors the root design.md. */
export const colors = {
  /** Surface hierarchy: bg (paper) < surface (cards, fields) < raised (selected pills, sheets, popovers). */
  bg: '#F7F4ED',
  surface: '#FFFDFA',
  raised: '#FFFFFF',
  /** Recessed tracks behind segmented controls and disabled fields; one step below paper. */
  sunken: '#EEEAE1',
  ink: '#142E43',
  /** Pressed state of navy controls. */
  inkPressed: '#0D2233',
  text: '#142E43',
  muted: '#52616B',
  faint: '#52616B',
  /** Card and control outlines; slightly warmer and darker than the old #DFE0DC so edges read on paper. */
  line: '#D9D5CB',
  /** Field outlines: inputs must read as editable, so they sit one step darker than card edges (3:1 vs surface). */
  lineStrong: '#8D9297',
  /** Row separators inside a card. */
  divider: '#E8E4DB',
  soft: '#EDEAE3',
  accent: '#8B6D32',
  accentInk: '#73520C',
  accentSoft: '#F7F3EB',
  good: '#227050',
  goodSoft: '#EAF3ED',
  warn: '#A83232',
  warnSoft: '#FAEDEB',
  info: '#36566B',
  infoSoft: '#E8EDF0',
  /** Navy-tinted backdrop behind modal sheets and the calendar picker. */
  scrim: 'rgba(20,46,67,0.45)',
} as const;

/**
 * Anuphan carries headings and numbers (the mockups' display face); body text
 * stays on the system font, which renders Thai well on both platforms.
 */
export const fonts = {
  semibold: 'Anuphan_600SemiBold',
  bold: 'Anuphan_700Bold',
} as const;

/** sm: tags/chips · md: controls (8px, per design.md) · lg: cards · xl: sheets. `card`/`pill`/`button` keep the old names. */
export const radius = { sm: 6, md: 8, lg: 12, xl: 16, card: 12, pill: 6, button: 8, full: 999 } as const;
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
  sm: { boxShadow: '0px 1px 2px rgba(20, 46, 67, 0.06), 0px 1px 3px rgba(20, 46, 67, 0.05)' },
  md: { boxShadow: '0px 2px 4px rgba(20, 46, 67, 0.06), 0px 4px 12px rgba(20, 46, 67, 0.08)' },
  lg: { boxShadow: '0px 8px 24px rgba(20, 46, 67, 0.14), 0px 2px 6px rgba(20, 46, 67, 0.08)' },
  /** Focus ring drawn outside a focused field's border (does not shift layout). */
  focus: { boxShadow: '0px 0px 0px 3px rgba(20, 46, 67, 0.16)' },
  /** Same ring in the warning hue, for a focused field that has an error. */
  focusWarn: { boxShadow: '0px 0px 0px 3px rgba(168, 50, 50, 0.16)' },
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
export const control = { height: 48, borderWidth: 1 } as const;

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
