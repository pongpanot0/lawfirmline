import { describe, expect, it } from '@jest/globals';
import { stripEmailSignature, stripHtmlSignature } from './strip-email-signature';

describe('stripEmailSignature', () => {
  it.each([
    ['เนื้อหา\n\nขอแสดงความนับถือ\nสมชาย\nบริษัท ก', 'เนื้อหา'],
    ['รายละเอียด\nด้วยความเคารพ\nนางสาว สมศรี', 'รายละเอียด'],
    ['Please review.\nBest regards,\nJane Smith\nManager', 'Please review.'],
    ['Please review.\nRegards\nJane Smith', 'Please review.'],
    ['Please review.\nThanks\nJane Smith', 'Please review.'],
    ['Please review.\nSincerely,\nJane Smith', 'Please review.'],
    ['รายละเอียด\nขอบคุณค่ะ\nนางสาว สมศรี', 'รายละเอียด'],
    ['รายละเอียด\nขอบคุณครับ', 'รายละเอียด'],
    ['Please review.\nSent from my iPhone', 'Please review.'],
    ['กรุณาตรวจสอบยอดเรียกร้อง\n\nNathamon Chanitaphat\nRisk management Manager\nKasemrad Ramkhamhaeng Hospital\n02-339-0000 ต่อ 4006', 'กรุณาตรวจสอบยอดเรียกร้อง'],
    ['รายละเอียด\n\nนางสาว สมศรี ใจดี\nผู้จัดการฝ่ายกฎหมาย\nบริษัท ทดสอบ\nโทร 02-123-4567', 'รายละเอียด'],
    ['Please review.\r\nRegards\r\nJane Smith', 'Please review.'],
  ])('strips a trailing signature: %s', (input, expected) => {
    expect(stripEmailSignature(input)).toBe(expected);
  });

  it.each(['', 'Regards', 'Thanks\nPlease review the claim.', 'ขอบคุณค่ะ\nรายละเอียด', 'รายละเอียด\n\nรายการค่าใช้จ่าย\nค่ารักษา 100 บาท', '\nRegards\nJane Smith'])('preserves content and never leaves an empty result', (input) => {
    expect(stripEmailSignature(input)).toBe(input);
  });
});

describe('closing thanks followed by more message', () => {
  it('keeps a P.S. with an amount after "ขอบคุณค่ะ"', () => {
    const body = 'เรียนทีม\nส่งเอกสารตามแนบ\nขอบคุณค่ะ\nป.ล. ยอดที่ถูกต้อง 400,000 บาท';
    expect(stripEmailSignature(body)).toBe(body);
  });
});

describe('stripHtmlSignature', () => {
  it('cuts at an Outlook signature block', () => {
    const html = '<div>ขอบคุณค่ะ อย่างไรจะตรวจสอบกับบัญชีนะคะ</div><div id="Signature"><p>Nathamon</p><img src="cid:x"></div>';
    expect(stripHtmlSignature(html)).toBe('<div>ขอบคุณค่ะ อย่างไรจะตรวจสอบกับบัญชีนะคะ</div>');
  });
  it('cuts at a Gmail signature block', () => {
    expect(stripHtmlSignature('<p>hi</p><div class="gmail_signature">Bob</div>')).toBe('<p>hi</p>');
  });
  it('cuts an unmarked Outlook signature at its sign-off line', () => {
    const html = '<div><p>เรียนคุณจิรญาดา</p><p>บริษัทฯ ขอนำส่งรายงานข้อเท็จจริงและความเห็นตามแนบเพื่อพิจารณาครับ</p><p>Best regards,</p><p>Mr. Weerayuth Sakuntaprasert</p><p>Managing Director &amp; Senior Lawyer</p><p>THE SIAM BARRISTERS COMPANY LIMITED</p></div>';
    expect(stripHtmlSignature(html)).toBe('<div><p>เรียนคุณจิรญาดา</p><p>บริษัทฯ ขอนำส่งรายงานข้อเท็จจริงและความเห็นตามแนบเพื่อพิจารณาครับ</p>');
  });
  it('keeps "regards" that is part of a sentence, and a long tail after a sign-off', () => {
    const inSentence = '<p>With regards to the claim, please see attached.</p>';
    expect(stripHtmlSignature(inSentence)).toBe(inSentence);
    const longTail = '<p>hi</p><p>Regards,</p><p>' + 'x'.repeat(2000) + '</p>';
    expect(stripHtmlSignature(longTail)).toBe(longTail);
  });
  it('leaves a body without a marker, or one that is only a signature', () => {
    expect(stripHtmlSignature('<p>hi</p><p>Bob</p>')).toBe('<p>hi</p><p>Bob</p>');
    expect(stripHtmlSignature('<div id="Signature">Bob</div>')).toBe('<div id="Signature">Bob</div>');
  });
});
