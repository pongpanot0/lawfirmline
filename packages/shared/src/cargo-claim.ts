export const CARGO_REVIEW_STATUSES = ['DRAFT', 'CONFIRMED'] as const;
export type CargoReviewStatus = (typeof CARGO_REVIEW_STATUSES)[number];

export const CARGO_DOCUMENT_REQUIREMENTS = [
  { code: 'INVOICE_PACKING_LIST', label: 'Invoice & Packing List', requiredByDefault: true },
  { code: 'CARGO_POLICY', label: 'Insurance contract / Institute Cargo Clauses', requiredByDefault: false },
  { code: 'CARRIAGE_DOCUMENT', label: 'Bill of Lading / HAWB / MAWB', requiredByDefault: true },
  { code: 'SURVEY_DAMAGE_EVIDENCE', label: 'Survey Report / Photo of damaged', requiredByDefault: true },
  { code: 'QC_TEST_REPORT', label: 'QC Report / Test Report', requiredByDefault: false },
  { code: 'CERTIFICATE_OF_DESTRUCTION', label: 'Certificate of destruction', requiredByDefault: false },
  { code: 'SALVAGE_AUCTION', label: 'Salvage value / Auction', requiredByDefault: false },
  { code: 'NOTICE_TO_CARRIER', label: 'Notice of claim to carrier', requiredByDefault: true },
  { code: 'SUBROGATION_EVIDENCE', label: 'Subrogation receipt & pay slip', requiredByDefault: false },
  { code: 'CARRIAGE_SERVICE_EVIDENCE', label: 'Quotation / Invoice / Receipt for carriage services', requiredByDefault: false },
  { code: 'ACCIDENT_REPORT', label: 'Accident report', requiredByDefault: false },
  { code: 'POLICE_DAILY_REPORT', label: 'Daily report by police', requiredByDefault: false },
  { code: 'DMC_REPORT', label: 'DMC Report', requiredByDefault: false },
  { code: 'DAMAGED_WEIGHT', label: 'Weight of damaged', requiredByDefault: false },
  { code: 'CARRIER_INSURANCE', label: "Carrier's Liability Insurance / other insurance", requiredByDefault: false },
  { code: 'OTHER', label: 'Other cargo-claim evidence', requiredByDefault: false },
] as const;

export type CargoDocumentCode = (typeof CARGO_DOCUMENT_REQUIREMENTS)[number]['code'];
