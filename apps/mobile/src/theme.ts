/* Hallmark · pre-emit critique: P4 H4 E4 S4 R4 V4
 * genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */
/** Editorial Juris: paper cream, navy controls; mirrors the root design.md. */
export const colors = {
  bg: '#F7F4ED',
  surface: '#FFFDFA',
  ink: '#142E43',
  text: '#142E43',
  muted: '#52616B',
  faint: '#52616B',
  line: '#DFE0DC',
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
} as const;

/**
 * Anuphan carries headings and numbers (the mockups' display face); body text
 * stays on the system font, which renders Thai well on both platforms.
 */
export const fonts = {
  semibold: 'Anuphan_600SemiBold',
  bold: 'Anuphan_700Bold',
} as const;

export const radius = { card: 8, pill: 4, button: 8 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

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
