#!/usr/bin/env node
// Usage: LINE_CHANNEL_ACCESS_TOKEN=... node scripts/line-rich-menu.mjs <image.jpg> [--dry-run]
// Tap areas match apps/api/public/line-assets/rich-menu-leave.jpg.
// Creates the rich menu, uploads the image, sets it as default for all users.
import { readFileSync } from 'node:fs';

const CELLS = [
  ['เพิ่ม Task', 0, 0, 510, 475],
  ['สร้าง Todo', 510, 0, 507, 475],
  ['สร้าง Case', 1017, 0, 510, 475],
  ['บันทึกค่าใช้จ่าย', 0, 475, 510, 465],
  ['เบิกล่วงหน้า', 510, 475, 507, 465],
  ['ลางาน', 1017, 475, 510, 465],
  ['เมนู', 0, 940, 1527, 90],
];
const menu = {
  size: { width: 1527, height: 1030 },
  selected: true,
  name: 'lawfirm-main',
  chatBarText: 'เมนู',
  areas: CELLS.map(([text, x, y, width, height]) => ({
    bounds: { x, y, width, height },
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
if (!/\.(png|jpe?g)$/i.test(imagePath)) {
  console.error('image must be PNG or JPEG');
  process.exit(1);
}
const image = readFileSync(imagePath);
if (image.byteLength > 1_000_000) {
  console.error('image exceeds the 1 MB LINE rich menu limit');
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

const contentType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
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
