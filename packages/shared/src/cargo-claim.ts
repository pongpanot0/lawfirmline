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

export const CARGO_CLAIM_PLAYBOOK_KEY = 'CARGO_CLAIM_ASSESSMENT' as const;
export const CARGO_CLAIM_PLAYBOOK_NAME = 'Cargo Claim Assessment' as const;

export interface CargoPlaybookRequirement {
  code: string;
  label: string;
  requiredByDefault: boolean;
}

export interface CargoPlaybookTemplate {
  requirements: CargoPlaybookRequirement[];
}

export const CARGO_CLAIM_PLAYBOOK_STEPS = [
  { title: 'Confirm cargo facts and transport mode', instructions: 'Verify the parties, route, transport document, dates, goods, damage and amount claimed against source documents.', primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER' },
  { title: 'Collect and verify cargo claim documents', instructions: 'Work through the Playbook document checklist, link each source file and record missing or non-applicable evidence.', primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER' },
  { title: 'Determine applicable law', instructions: 'Identify the governing contract, convention and statute. Record the legal basis and source.', primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER' },
  { title: 'Determine jurisdiction', instructions: 'Assess competent court, arbitration or other forum and record the basis.', primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER' },
  { title: 'Identify liable parties', instructions: 'Distinguish contracting and actual carriers and identify each potential liable party.', primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER' },
  { title: 'Assess liability limits and exclusions', instructions: 'Analyse contractual and statutory limits, exclusions, defences and any conduct affecting reliance on them.', primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER' },
  { title: 'Calculate Time Bar', instructions: 'Record the period, trigger date, calculated deadline and legal basis. Treat the result as a lawyer-reviewed conclusion.', primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER' },
  { title: 'Quantify damage, salvage and subrogation', instructions: 'Reconcile insured loss, salvage, payments, subrogation evidence and recoverable quantum.', primaryRole: 'LAWYER', secondaryRole: 'ASSISTANT' },
  { title: 'Assess recovery strategy and cost-benefit', instructions: 'Prepare the recommended claim, negotiation or litigation path with risks and proportionality.', primaryRole: 'SENIOR_LAWYER', secondaryRole: 'LAWYER' },
  { title: 'Lawyer review and confirm Cargo opinion', instructions: 'Review every source-backed fact and conclusion before confirming the Cargo analysis.', primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER' },
] as const;
