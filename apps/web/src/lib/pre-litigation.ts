/** สถานะงานก่อนฟ้อง — ใช้ร่วมกันทั้งหน้า intake และหน้าคดี */
export const PRE_LITIGATION_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'ยังไม่เริ่ม',
  NOTICE_TO_SEND: 'เตรียมส่ง Notice',
  NOTICE_SENT: 'ส่ง Notice แล้ว',
  UNDER_REVIEW: 'รอพิจารณา/ตรวจเอกสาร',
  REPORT_PREPARED: 'ทำสรุปรายงานแล้ว',
  OFFER_RECEIVED: 'ได้รับข้อเสนอจ่าย',
  NEGOTIATING: 'เจรจาก่อนฟ้อง',
  APPEAL_REVIEW: 'อุทธรณ์/ขอทบทวนความเห็น',
  READY_TO_FILE: 'พร้อมพิจารณาฟ้อง',
  CLOSED_SETTLED: 'จบด้วยการตกลง',
  CLOSED_NO_FILE: 'ปิดเรื่องโดยไม่ฟ้อง',
};
