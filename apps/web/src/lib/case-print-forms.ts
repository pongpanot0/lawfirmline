import type { CaseDetail } from './api';

export type CasePrintKind = 'complaint' | 'cover';
export type CasePrintValues = Record<string, string>;
export const CASE_PRINT_LABELS = { complaint: 'คำฟ้อง (หน้าแรก)', cover: 'ปกสำนวนคดี' };

export function casePrintDefaults(c: CaseDetail, firmName: string): CasePrintValues {
  const parties = (roles: string[]) => (c.participants ?? []).filter(p => roles.includes(p.role)).map(p => p.name).join(' และ ');
  const partyDetails = (roles: string[], field: 'idNumber' | 'address' | 'contact') => {
    const matches = (c.participants ?? []).filter(p => roles.includes(p.role));
    return matches.map(p => {
      const value = field === 'contact' ? [p.phone, p.email].filter(Boolean).join(' / ') : p[field];
      return value ? `${matches.length > 1 ? `${p.name}: ` : ''}${value}` : '';
    }).filter(Boolean).join('\n');
  };
  return {
    firmName, firmEnglish: '', ownRef: c.ownRef, policyNumber: c.insuranceClaim?.policyNumber ?? '',
    blackNumber: c.blackCaseNumber ?? '', redNumber: c.redCaseNumber ?? '', court: c.courtName ?? '',
    plaintiff: parties(['PLAINTIFF', 'JOINT_PLAINTIFF']) || (c.partyRole === 'PLAINTIFF' ? c.clientName ?? c.client?.name ?? '' : ''),
    defendant: parties(['DEFENDANT']) || (!c.participants?.length && c.partyRole === 'DEFENDANT' ? c.clientName ?? c.client?.name ?? '' : ''), jointDefendant: parties(['JOINT_DEFENDANT']),
    subject: typeof c.customFields?.chargeSection === 'string' ? c.customFields.chargeSection.trim() : '', amount: c.claimedAmount == null ? '' : c.claimedAmount.toLocaleString('th-TH', { maximumFractionDigits: 2 }),
    lawyerSide: c.partyRole === 'PLAINTIFF' ? 'โจทก์' : c.partyRole === 'DEFENDANT' ? 'จำเลย' : '',
    lawyerName: `${c.leadLawyer.firstName} ${c.leadLawyer.lastName}`.trim(),
    caseClass: '', filedDate: '', complaintDate: '', answerDate: '', counterclaimDate: '', mediationDate: '', settlementDate: '',
    closingDate: '', judgmentDate: '', appealDate: '', appealAnswerDate: '', appealJudgmentDate: '', supremeDate: '', supremeAnswerDate: '', supremeJudgmentDate: '',
    firstParagraph: '', plaintiffIdentity: partyDetails(['PLAINTIFF', 'JOINT_PLAINTIFF'], 'idNumber'), plaintiffAddress: partyDetails(['PLAINTIFF', 'JOINT_PLAINTIFF'], 'address'), plaintiffContact: partyDetails(['PLAINTIFF', 'JOINT_PLAINTIFF'], 'contact'), contactAddress: '', contactDetails: '',
    defendantIdentity: partyDetails(['DEFENDANT'], 'idNumber'), defendantAddress: partyDetails(['DEFENDANT'], 'address'), defendantContact: partyDetails(['DEFENDANT'], 'contact'),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** All case text remains text; no raw HTML, remote images, or scripts enter the print frame. */
export function buildCasePrintHtml(kind: CasePrintKind, values: CasePrintValues, emblem = ''): string {
  const v = (key: string) => escapeHtml(values[key] ?? '');
  const line = (label: string, key: string, suffix = '') => `<div class="line"><span>${label}</span><span class="value">${v(key) || '&nbsp;'}</span><span>${suffix}</span></div>`;
  const pair = (...rows: string[]) => `<div class="pair">${rows.join('')}</div>`;
  const image = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(emblem) ? `<img class="emblem" src="${emblem}" alt="">` : '';
  const numbers = `<div class="numbers">${line('หมายเลขคดีดำ', 'blackNumber')}${line('หมายเลขคดีแดง', 'redNumber')}</div>`;
  const parties = `<div class="parties"><span>ระหว่าง</span><div class="brace">${line('', 'plaintiff', 'โจทก์')}${values.jointDefendant ? line('', 'jointDefendant', 'จำเลยร่วม') : ''}${line('', 'defendant', 'จำเลย')}</div></div>`;
  const cover = `<header class="letterhead">${image}<div><h1>${v('firmName')}</h1><h2>${v('firmEnglish')}</h2></div></header>
    <div class="references">TSB Ref. ${v('ownRef')}<br>Policy No. ${v('policyNumber')}</div>
    <h1 class="title">สำนวนคดี</h1>${numbers}${line('ศาล', 'court')}${parties}
    ${pair(line('ข้อหาหรือฐานความผิด', 'subject'), line('ทุนทรัพย์', 'amount', 'บาท'))}
    ${pair(line('ทนายฝ่าย', 'lawyerSide'), line('วันฟ้อง', 'filedDate'))}
    ${pair(line('วันให้การ', 'answerDate'), line('วันฟ้องแย้ง', 'counterclaimDate'))}
    ${line('ไกล่เกลี่ย / ให้การ / สืบพยาน', 'mediationDate')}${line('นัดชี้สองสถาน / สืบโจทก์', 'settlementDate')}
    <div class="hearings">${[0, 6].map(offset => `<section><h3>นัดพิจารณา</h3>${Array.from({ length: 6 }, (_, i) => line(`${offset + i + 1}.`, `hearing${offset + i + 1}`)).join('')}</section>`).join('')}</div>
    ${pair(line('วันแถลงปิดคดี', 'closingDate'), line('วันตัดสิน', 'judgmentDate'))}
    ${pair(line('วันอุทธรณ์', 'appealDate'), line('วันแก้อุทธรณ์', 'appealAnswerDate'))}${line('วันฟังคำพิพากษาศาลอุทธรณ์', 'appealJudgmentDate')}
    ${pair(line('วันฎีกา', 'supremeDate'), line('วันแก้ฎีกา', 'supremeAnswerDate'))}${line('วันฟังคำพิพากษาศาลฎีกา', 'supremeJudgmentDate')}`;
  const complaint = `<header class="complaint-head"><span></span>${image}<h1>คำฟ้อง</h1></header>${numbers}
    ${line('ศาล', 'court')}${line('วันที่', 'complaintDate')}${line('ความ', 'caseClass')}${parties}
    ${line('เรื่อง', 'subject')}${line('จำนวนทุนทรัพย์', 'amount', 'บาท')}
    ${line('ข้าพเจ้า', 'plaintiff', 'โจทก์')}
    ${line('เชื้อชาติ / สัญชาติ / อาชีพ / อายุ / เลขประจำตัว', 'plaintiffIdentity')}
    ${line('อยู่บ้านเลขที่ / ถนน / ตำบล / อำเภอ / จังหวัด', 'plaintiffAddress')}
    ${line('โทรศัพท์ / โทรสาร / อีเมล', 'plaintiffContact')}
    ${line('สถานที่ติดต่อ', 'contactAddress')}${line('โทรศัพท์ / โทรสาร / อีเมล', 'contactDetails')}
    ${line('ขอยื่นฟ้อง', 'defendant', 'จำเลย')}${values.jointDefendant ? line('จำเลยร่วม', 'jointDefendant') : ''}
    ${line('เชื้อชาติ / สัญชาติ / อาชีพ / อายุ / เลขประจำตัว', 'defendantIdentity')}
    ${line('อยู่บ้านเลขที่ / ถนน / ตำบล / อำเภอ / จังหวัด', 'defendantAddress')}
    ${line('โทรศัพท์ / โทรสาร / อีเมล', 'defendantContact')}
    <p class="right">มีข้อความตามที่จะกล่าวต่อไปนี้</p><div class="narrative">${v('firstParagraph')}</div>
    <div class="signature">ลงชื่อ ..................................................<br>${v('lawyerName')}<br>ทนายความ</div>`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${CASE_PRINT_LABELS[kind]} - ${v('ownRef')}</title><style>
    *{box-sizing:border-box}html,body{margin:0;padding:0;background:white;color:#111}body{font-family:Tahoma,"Thonburi",sans-serif;font-size:12px;line-height:1.6}.sheet{width:210mm;min-height:297mm;padding:16mm 18mm;position:relative}h1,h2,h3,p{margin:0}h1{font-size:21px;font-weight:normal}h2{font-size:17px;font-weight:normal}h3{font-size:13px;text-align:center;text-decoration:underline;font-weight:normal}.title{text-align:center;margin:10mm 0 7mm;text-decoration:underline;font-size:25px}.letterhead{display:flex;align-items:center;gap:6mm;border-bottom:1px solid #222;padding:3mm 0}.emblem{width:19mm;height:22mm;object-fit:contain}.references{text-align:right;font-size:10px;margin-top:2mm}.numbers{width:90mm;margin-left:auto;margin-bottom:4mm}.line{display:flex;align-items:baseline;gap:2mm;min-height:8mm;padding-top:1mm;break-inside:avoid}.value{flex:1;border-bottom:1px dotted #888;white-space:pre-wrap;overflow-wrap:anywhere;min-width:0;line-height:1.5}.pair{display:flex;gap:5mm}.pair>.line{flex:1;min-width:0}.parties{display:flex;align-items:center;gap:4mm;margin:4mm 0}.brace{flex:1;min-width:0;border-left:1px solid #333;border-radius:7px;padding-left:4mm}.hearings{display:grid;grid-template-columns:1fr 1fr;gap:15mm;margin:5mm 0}.hearings .line{min-height:9mm}.complaint-head{display:flex;align-items:center;justify-content:space-between;min-height:23mm}.complaint-head h1{margin-right:20mm}.right{text-align:right;margin-top:3mm}.narrative{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.9;min-height:20mm;margin-top:3mm}.signature{text-align:center;margin:5mm 0 0 auto;width:75mm;break-inside:avoid}@page{size:A4 portrait;margin:0}@media print{.sheet{margin:0;box-shadow:none}}
    </style></head><body><main class="sheet">${kind === 'cover' ? cover : complaint}</main></body></html>`;
}
