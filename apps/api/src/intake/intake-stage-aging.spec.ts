import { withAging } from './intake.service';

const DAY = 24 * 60 * 60 * 1000;

describe('withAging — คำถามของหน้า intake คือ "ค้างมากี่วัน" ไม่ใช่ "สถานะอะไร"', () => {
  it('นับอายุเรื่อง วันในสถานะ และวันในขั้นตอน แยกกัน', () => {
    const now = Date.now();
    const result = withAging({
      createdAt: new Date(now - 30 * DAY),
      statusChangedAt: new Date(now - 10 * DAY),
      stageChangedAt: new Date(now - 3 * DAY),
      nextFollowUpAt: null,
    });

    expect(result.ageDays).toBe(30);
    expect(result.daysInStatus).toBe(10);
    expect(result.daysInStage).toBe(3);
    expect(result.followUpOverdueDays).toBeNull();
  });

  it('นัดติดตามที่เลยกำหนดบอกจำนวนวันที่เลย', () => {
    const now = Date.now();
    expect(
      withAging({
        createdAt: new Date(now - 5 * DAY),
        nextFollowUpAt: new Date(now - 2 * DAY),
      }).followUpOverdueDays,
    ).toBe(2);
  });

  it('นัดติดตามในอนาคตยังไม่เลยกำหนด (ไม่ติดลบ)', () => {
    const now = Date.now();
    expect(
      withAging({
        createdAt: new Date(now - 5 * DAY),
        nextFollowUpAt: new Date(now + 3 * DAY),
      }).followUpOverdueDays,
    ).toBe(0);
  });

  it('เรื่องที่ไม่เคยเปลี่ยนสถานะใช้วันที่สร้างเป็นจุดเริ่ม', () => {
    const now = Date.now();
    const result = withAging({ createdAt: new Date(now - 7 * DAY) });
    expect(result.daysInStatus).toBe(7);
    expect(result.daysInStage).toBe(7);
  });
});
