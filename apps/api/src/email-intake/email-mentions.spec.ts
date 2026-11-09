import { findDueDate, parseEmailMentions } from './email-mentions';

const NOW = new Date('2026-08-06T00:00:00Z');
const mention = (email: string, name: string) =>
  `<a id="OWAAM123" href="mailto:${email}" class="_1OtrSZdhKXVv3UhaivrdJ4 mention" contenteditable="false"><span>@${name}</span></a>`;

describe('parseEmailMentions', () => {
  it('reads each @mention and its ask from an Outlook body, ignoring the signature line', () => {
    const html = `<div>${mention('Oranan@SiamBarristers.com', 'Oranan Yubolpled')} ทำใบแต่งทนายของพี่, โบ และดาว</div>
      <div>${mention('suchanya@siambarristers.com', 'Suchanya Umoung')} ร่างคำให้การเตรียมยื่นภายในกำหนดระยะเวลาที่ศาลสั่ง (๒๑ ก.ย. ๒๕๖๙) หากต้องมีการนัดประชุมกับยูนิโคล ให้ประสานงานกับ TMSTH เพื่อนัดวันประชุมได้เลยครับ</div>
      <div><br></div><div>Weerayuth</div>`;
    expect(parseEmailMentions(html, NOW)).toEqual([
      { email: 'oranan@siambarristers.com', name: 'Oranan Yubolpled', text: 'ทำใบแต่งทนายของพี่, โบ และดาว', dueDate: null },
      {
        email: 'suchanya@siambarristers.com',
        name: 'Suchanya Umoung',
        text: 'ร่างคำให้การเตรียมยื่นภายในกำหนดระยะเวลาที่ศาลสั่ง (๒๑ ก.ย. ๒๕๖๙) หากต้องมีการนัดประชุมกับยูนิโคล ให้ประสานงานกับ TMSTH เพื่อนัดวันประชุมได้เลยครับ',
        dueDate: '2026-09-21',
      },
    ]);
  });

  it('ignores mentions in the quoted reply history and plain mailto links', () => {
    const html = `<div>ขอบคุณครับ <a href="mailto:a@x.com">a@x.com</a></div>
      <div id="appendonsend"></div><div>${mention('b@x.com', 'B')} old ask</div>`;
    expect(parseEmailMentions(html, NOW)).toEqual([]);
  });

  it('gives "@A @B do X" to both and merges two asks for one person', () => {
    const html = `<p>${mention('a@x.com', 'A')} ${mention('b@x.com', 'B')} ยื่นคำร้อง 1/9/2569</p><p>${mention('a@x.com', 'A')} โทรหาลูกความ</p>`;
    const result = parseEmailMentions(html, NOW);
    expect(result.map((m) => [m.email, m.text, m.dueDate])).toEqual([
      ['a@x.com', 'ยื่นคำร้อง 1/9/2569\nโทรหาลูกความ', '2026-09-01'],
      ['b@x.com', 'ยื่นคำร้อง 1/9/2569', '2026-09-01'],
    ]);
  });

  it('takes the next line when the ask starts below the mention, and drops a bare mention', () => {
    const html = `<div>${mention('a@x.com', 'A')}</div><div>ส่งสำเนา</div><div>FYI ${mention('b@x.com', 'B')}</div>`;
    expect(parseEmailMentions(html, NOW).map((m) => [m.email, m.text])).toEqual([['a@x.com', 'ส่งสำเนา']]);
  });
});

describe('findDueDate', () => {
  it('skips counts that look like dates', () => {
    expect(findDueDate('ยื่นภายใน 7 วัน จำนวน 2 ฉบับ', NOW)).toBeNull();
    expect(findDueDate('ภายใน 30 ก.ย. 69', NOW)).toBe('2026-09-30');
  });
});
