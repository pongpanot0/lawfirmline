/* Hallmark · pre-emit critique: P4 H4 E4 S4 R4 V4
 * genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */
/** White canvas, quiet navy controls, and restrained semantic status colors. */
export const colors = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  ink: '#12394C',
  text: '#203545',
  muted: '#526777',
  faint: '#546B7B',
  line: '#DFE4E8',
  soft: '#F5F7F9',
  accent: '#8B6D32',
  accentInk: '#73520C',
  accentSoft: '#F7F3EB',
  good: '#227050',
  goodSoft: '#F0F6F2',
  warn: '#A83232',
  warnSoft: '#FBF2F1',
  info: '#36566B',
  infoSoft: '#F1F5F7',
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
