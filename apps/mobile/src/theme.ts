/* Hallmark · pre-emit critique: P4 H4 E4 S4 R4 V4
 * genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */
/** Samnuan navy, warm court accents, and readable status colors. */
export const colors = {
  bg: '#EDF3F7',
  surface: '#FFFFFF',
  ink: '#12394C',
  text: '#203545',
  muted: '#526777',
  faint: '#546B7B',
  line: '#D3E0E8',
  soft: '#E5EEF4',
  accent: '#A77921',
  accentInk: '#73520C',
  accentSoft: '#FFF2D4',
  good: '#227050',
  goodSoft: '#E4F3EC',
  warn: '#A83232',
  warnSoft: '#FCE5E3',
  info: '#086C80',
  infoSoft: '#E0F1F5',
  // Court Day runs dark and high-contrast for hallway readability.
  night: '#131A28',
  nightCard: '#1C2434',
  nightLine: '#2A3448',
  nightText: '#C9D2E0',
  nightBright: '#E8EDF5',
  nightMuted: '#7E8AA0',
} as const;

/**
 * Anuphan carries headings and numbers (the mockups' display face); body text
 * stays on the system font, which renders Thai well on both platforms.
 */
export const fonts = {
  semibold: 'Anuphan_600SemiBold',
  bold: 'Anuphan_700Bold',
} as const;

export const radius = { card: 14, pill: 999, button: 10 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const pageContent = {
  width: '100%',
  maxWidth: 1080,
  alignSelf: 'center',
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.md,
  paddingBottom: spacing.xl,
} as const;

// Gap-based forms already separate siblings; avoid adding the label's bottom margin twice.
export const formLabelSpacing = { marginTop: spacing.sm, marginBottom: 0 } as const;

/** Minimum comfortable one-hand tap target. */
export const TOUCH = 44;
