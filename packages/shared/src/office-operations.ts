export enum LawyerLicenseType {
  TWO_YEAR = 'TWO_YEAR',
  LIFETIME = 'LIFETIME',
}

export enum PaperFileAction {
  CHECK_OUT = 'CHECK_OUT',
  CHECK_IN = 'CHECK_IN',
  MOVE = 'MOVE',
}

/** Licence reminder milestones, as days relative to the expiry date (negative = before). */
export const LICENSE_MILESTONES = {
  OPEN_90: -90,
  DUE_30: -30,
  DUE_7: -7,
  EXPIRED: 0,
  LATE_45: 45,
} as const;

export type LicenseMilestone = keyof typeof LICENSE_MILESTONES;
