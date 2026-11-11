export function missingFields(values: { caseTypeId: string; title: string; leadLawyerId: string; inCourt: boolean; courtName: string; blackCaseNumber: string; blackUnknown: boolean }) {
  return [
    ...(!values.caseTypeId ? [{ id: 'case-type', label: 'ประเภทคดี', message: 'ยังไม่ได้เลือกประเภทคดี' }] : []),
    ...(!values.title.trim() ? [{ id: 'case-title', label: 'ชื่อคดี', message: 'ยังไม่มีชื่อคดี' }] : []),
    ...(!values.leadLawyerId ? [{ id: 'lead-lawyer', label: 'ทนายผู้รับผิดชอบ', message: 'ยังไม่ได้เลือกทนายผู้รับผิดชอบ' }] : []),
    ...(values.inCourt && !values.courtName.trim() ? [{ id: 'court-name', label: 'ชื่อศาล', message: 'ยังไม่ได้เลือกชื่อศาล' }] : []),
    ...(values.inCourt && !values.blackUnknown && !values.blackCaseNumber.trim() ? [{ id: 'black-case-number', label: 'หมายเลขคดีดำ', message: 'ยังไม่ได้กรอกหมายเลขคดีดำ' }] : []),
  ];
}
