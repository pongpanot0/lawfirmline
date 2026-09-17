#!/usr/bin/env node
// Usage: LINE_CHANNEL_ACCESS_TOKEN=... node scripts/line-rich-menu.mjs <image.png|jpg> [--dry-run]
// Creates the 6-cell rich menu, uploads the image, sets it as default for all users.
// Cell texts must match MENU_SELECTION_MAP / MYDAY_COMMAND in
// apps/api/src/notifications/line-conversation/line-bot-router.service.ts.
import { readFileSync } from 'node:fs';

const CELLS = [
  ['เพิ่ม Task', 0, 0],
  ['สร้าง Todo', 833, 0],
  ['สร้าง Case', 1666, 0],
  ['บันทึกค่าใช้จ่าย', 0, 843],
  ['เบิกล่วงหน้า', 833, 843],
  ['งานของฉันวันนี้', 1666, 843],
];
const menu = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: 'lawfirm-main',
  chatBarText: 'เมนู',
  areas: CELLS.map(([text, x, y]) => ({
    bounds: { x, y, width: x === 1666 ? 834 : 833, height: 843 },
    action: { type: 'message', text },
  })),
};

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const [imagePath, flag] = process.argv.slice(2);
if (!imagePath) {
  console.error('usage: line-rich-menu.mjs <image> [--dry-run]');
  process.exit(1);
}
if (flag === '--dry-run') {
  console.log(JSON.stringify(menu, null, 2));
  process.exit(0);
}
if (!token) {
  console.error('LINE_CHANNEL_ACCESS_TOKEN required');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${token}` };
const create = await fetch('https://api.line.me/v2/bot/richmenu', {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify(menu),
});
if (!create.ok) {
  console.error('create failed', create.status, await create.text());
  process.exit(1);
}
const { richMenuId } = await create.json();

const image = readFileSync(imagePath);
const contentType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
const upload = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': contentType },
  body: image,
});
if (!upload.ok) {
  console.error('upload failed', upload.status, await upload.text());
  process.exit(1);
}

const setDefault = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
  method: 'POST',
  headers,
});
if (!setDefault.ok) {
  console.error('set-default failed', setDefault.status, await setDefault.text());
  process.exit(1);
}
console.log(`✅ rich menu ${richMenuId} live`);
