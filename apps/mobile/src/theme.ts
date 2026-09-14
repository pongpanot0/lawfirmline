/** Design tokens shared by every screen — from the approved mockups. */
export const colors = {
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  ink: '#182B49',
  text: '#232B38',
  muted: '#5C6470',
  faint: '#8A93A1',
  line: '#E3E7EE',
  soft: '#EEF0F4',
  accent: '#A67C2E',
  accentInk: '#7C5A1E',
  accentSoft: '#F3EDDF',
  good: '#2E7D4F',
  goodSoft: '#E1F0E7',
  warn: '#B3402E',
  warnSoft: '#F9E3DE',
  info: '#3A5687',
  infoSoft: '#E6EBF4',
  // Court Day runs dark and high-contrast for hallway readability.
  night: '#131A28',
  nightCard: '#1C2434',
  nightLine: '#2A3448',
  nightText: '#C9D2E0',
  nightBright: '#E8EDF5',
  nightMuted: '#7E8AA0',
} as const;

export const radius = { card: 12, pill: 999, button: 10 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** Minimum comfortable one-hand tap target. */
export const TOUCH = 44;
