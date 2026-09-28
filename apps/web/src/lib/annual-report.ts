export interface AnnualReportSnapshot {
  clientName: string;
  year: number;
  audience: 'REPRESENTED' | 'PAYER';
  cases: Array<{
    id: string;
    ownRef: string;
    customerRef: string | null;
    policyRef: string | null;
    policyRelevant: boolean;
    blackCaseNumber: string | null;
    redCaseNumber: string | null;
    title: string;
    clientName: string | null;
    caseType: string | null;
    openedAt: string;
    stageAtPublication: string;
    statusAtYearEnd: string;
    closedAt: string | null;
    outcome: string | null;
    closingSummary: string | null;
    leadLawyer: string;
    claimedAmount: number | null;
    canOpenCase?: boolean;
  }>;
  totals: {
    cases: number;
    opened: number;
    closedInYear: number;
    closedAtYearEnd: number;
    ongoing: number;
    claimedAmount: number;
    claimedCaseCount: number;
    invoicedAmount: number;
    receivedAmount: number;
    unassignedInvoiceCount: number;
  };
}

export interface AnnualReportListItem {
  id: string;
  year: number;
  audience: 'REPRESENTED' | 'PAYER';
  publishedAt: string;
  revokedAt?: string | null;
  recipientContactIds?: string[];
  totals?: AnnualReportSnapshot['totals'];
  snapshot?: AnnualReportSnapshot;
}

export const reportAudienceLabel = (audience: AnnualReportSnapshot['audience']) =>
  audience === 'PAYER' ? 'ผู้ว่าจ้าง / ผู้จ่ายเงิน' : 'ลูกความ';
