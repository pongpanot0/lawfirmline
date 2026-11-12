import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitConfirmMessage } from './confirm-dialog.ts';

test('turns a window.confirm message into a titled dialog with a named action', () => {
  assert.deepEqual(splitConfirmMessage('อนุมัติใบเบิกนี้?'), { title: 'อนุมัติใบเบิกนี้?', body: '', action: 'อนุมัติใบเบิกนี้', danger: false });
  const del = splitConfirmMessage('ลบงาน "ร่างคำฟ้อง" ถาวร?\nงานย่อยและความคิดเห็นจะหายไป');
  assert.equal(del.title, 'ลบงาน "ร่างคำฟ้อง" ถาวร?');
  assert.equal(del.body, 'งานย่อยและความคิดเห็นจะหายไป');
  assert.equal(del.danger, true);
  assert.equal(del.action, 'ลบงาน');
  assert.equal(splitConfirmMessage('ปิดกฎ "ยื่นบัญชีระบุพยาน" สำหรับทั้งสำนักงาน?\nเปิดกลับได้ภายหลัง').action, 'ปิดกฎ');
  assert.equal(splitConfirmMessage('ต้องการส่งอีเมลตอบกลับลูกความตอนนี้ แม้ยังไม่ได้แนบไฟล์ใด ๆ ใช่ไหม?').action, 'ยืนยัน');
});
