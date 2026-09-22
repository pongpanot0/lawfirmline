type CaseReference = {
  ownRef?: string | null;
  blackCaseNumber?: string | null;
  redCaseNumber?: string | null;
};

export function formatCaseNotificationReference(caseRef: CaseReference): string | null {
  const numbers = [
    caseRef.blackCaseNumber && `หมายเลขคดีดำ ${caseRef.blackCaseNumber}`,
    caseRef.redCaseNumber && `หมายเลขคดีแดง ${caseRef.redCaseNumber}`,
  ].filter(Boolean);

  return numbers.join(' · ') || (caseRef.ownRef ? `Our Ref: ${caseRef.ownRef}` : null);
}

export function formatIntakeNotificationReference(ownRef?: string | null): string | null {
  return ownRef ? `Our Ref: ${ownRef}` : null;
}
