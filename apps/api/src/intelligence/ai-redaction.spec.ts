import { redactForAi, REDACTION_PLACEHOLDERS } from '@lawfirm/shared';

describe('redactForAi', () => {
  describe('removes what identifies a person', () => {
    it('removes a Thai national ID', () => {
      const { text, counts } = redactForAi('ผู้ร้องเลขบัตรประชาชน 1234567890123 ยื่นคำร้อง');
      expect(text).toBe(`ผู้ร้องเลขบัตรประชาชน ${REDACTION_PLACEHOLDERS.nationalId} ยื่นคำร้อง`);
      expect(counts.nationalId).toBe(1);
    });

    it('removes a national ID written with dashes', () => {
      expect(redactForAi('1-2345-67890-12-3').text).toBe(REDACTION_PLACEHOLDERS.nationalId);
    });

    it('removes Thai phone numbers in their usual shapes', () => {
      for (const phone of ['081-234-5678', '0812345678', '+66 81 234 5678', '02-111-2222']) {
        expect(redactForAi(`โทร ${phone} ครับ`).text).toBe(
          `โทร ${REDACTION_PLACEHOLDERS.phone} ครับ`,
        );
      }
    });

    it('removes email addresses', () => {
      expect(redactForAi('ติดต่อ somchai@example.com').text).toBe(
        `ติดต่อ ${REDACTION_PLACEHOLDERS.email}`,
      );
    });

    it('removes hospital and admission numbers, which the log masker misses', () => {
      const { text, counts } = redactForAi('HN 6512345 AN 680001234 ผู้ป่วยชายไทย');
      expect(text).toBe(
        `${REDACTION_PLACEHOLDERS.hospitalNumber} ${REDACTION_PLACEHOLDERS.hospitalNumber} ผู้ป่วยชายไทย`,
      );
      expect(counts.hospitalNumber).toBe(2);
    });

    it('removes a Thai-labelled medical record number', () => {
      expect(redactForAi('เลขที่ผู้ป่วย 6512345 เข้ารับการรักษา').text).toBe(
        `${REDACTION_PLACEHOLDERS.hospitalNumber} เข้ารับการรักษา`,
      );
    });

    it('removes a passport number', () => {
      expect(redactForAi('หนังสือเดินทาง AB1234567 ออกโดย').text).toBe(
        `หนังสือเดินทาง ${REDACTION_PLACEHOLDERS.passport} ออกโดย`,
      );
    });

    it('reports every kind it removed', () => {
      const { counts, redacted } = redactForAi(
        'บัตร 1234567890123 โทร 081-234-5678 อีเมล a@b.com',
      );
      expect(redacted).toBe(true);
      expect(counts).toEqual({ nationalId: 1, phone: 1, email: 1 });
    });
  });

  describe('keeps what the analysis reasons with', () => {
    // The log masker turns 2026-09-07 into ****0907, which is why it cannot be
    // reused here: the incident date decides the limitation period.
    it('keeps an ISO date', () => {
      expect(redactForAi('เกิดเหตุวันที่ 2026-09-07 ที่ศาลแพ่ง').text).toBe(
        'เกิดเหตุวันที่ 2026-09-07 ที่ศาลแพ่ง',
      );
    });

    it('keeps an ISO timestamp', () => {
      expect(redactForAi('บันทึกเมื่อ 2026-09-07T09:30:00Z').text).toBe(
        'บันทึกเมื่อ 2026-09-07T09:30:00Z',
      );
    });

    it('keeps a Thai-style date and a clock time', () => {
      expect(redactForAi('ผ่าตัดวันที่ 12/03/2568 เวลา 09:30 น.').text).toBe(
        'ผ่าตัดวันที่ 12/03/2568 เวลา 09:30 น.',
      );
    });

    it('keeps case numbers and statute sections', () => {
      const facts = 'ฎีกาที่ 12345/2562 ตาม ป.พ.พ. มาตรา 420 คดีหมายเลขดำที่ พ.1234/2569';
      expect(redactForAi(facts).text).toBe(facts);
    });

    it('keeps amounts, formatted or not', () => {
      expect(redactForAi('ค่าเสียหาย 1,500,000 บาท และ 250000 บาท').text).toBe(
        'ค่าเสียหาย 1,500,000 บาท และ 250000 บาท',
      );
    });

    it('keeps a date that sits next to an identifier it does remove', () => {
      const { text } = redactForAi('เกิดเหตุ 2026-09-07 ผู้ร้องโทร 081-234-5678');
      expect(text).toBe(`เกิดเหตุ 2026-09-07 ผู้ร้องโทร ${REDACTION_PLACEHOLDERS.phone}`);
    });

    it('leaves text with no identifiers completely untouched', () => {
      const facts = 'จำเลยผิดสัญญาจ้างก่อสร้าง ส่งมอบงานล่าช้า 45 วัน';
      const { text, redacted, counts } = redactForAi(facts);
      expect(text).toBe(facts);
      expect(redacted).toBe(false);
      expect(counts).toEqual({});
    });
  });

  describe('edge cases', () => {
    it('handles empty and missing input', () => {
      expect(redactForAi('')).toEqual({ text: '', counts: {}, redacted: false });
      expect(redactForAi(null)).toEqual({ text: '', counts: {}, redacted: false });
      expect(redactForAi(undefined)).toEqual({ text: '', counts: {}, redacted: false });
    });

    it('removes every occurrence, not only the first', () => {
      const { counts } = redactForAi('โทร 081-234-5678 หรือ 089-876-5432');
      expect(counts.phone).toBe(2);
    });

    it('is idempotent — re-running does not touch its own placeholders', () => {
      const once = redactForAi('บัตร 1234567890123 โทร 081-234-5678').text;
      const twice = redactForAi(once);
      expect(twice.text).toBe(once);
      expect(twice.redacted).toBe(false);
    });
  });
});
