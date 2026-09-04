import { readFileSync } from 'fs';

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!TOKEN) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is required');

const RICH_MENU_BODY = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: 'law-main-menu',
  chatBarText: 'เมนู',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 2500, height: 843 },
      action: { type: 'message', label: 'สร้างงานใหม่', text: 'เมนู' },
    },
  ],
};

async function main() {
  const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(RICH_MENU_BODY),
  });
  if (!createRes.ok) throw new Error(`create failed: ${createRes.status} ${await createRes.text()}`);
  const { richMenuId } = await createRes.json();
  console.log('Created rich menu:', richMenuId);

  const imagePath = process.argv[2];
  if (!imagePath) throw new Error('Usage: ts-node setup-line-rich-menu.ts <path-to-2500x843-png>');
  const image = readFileSync(imagePath);
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'image/png' },
    body: image,
  });
  if (!uploadRes.ok) throw new Error(`image upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  console.log('Uploaded rich menu image');

  const defaultRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!defaultRes.ok) throw new Error(`set-default failed: ${defaultRes.status} ${await defaultRes.text()}`);
  console.log('Set as default rich menu for all users');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
