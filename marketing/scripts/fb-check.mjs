// Check FB_PAGE_ID / FB_PAGE_TOKEN in marketing/.env.
//   node marketing/scripts/fb-check.mjs           → token reaches the Page (read only)
//   node marketing/scripts/fb-check.mjs --live    → also schedule a hidden test post 29 days out, then delete it
import { readFile } from 'node:fs/promises';

const GRAPH = 'https://graph.facebook.com/v27.0';
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8')).split(/\r?\n/)
  .map(l => l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m => [m[1], m[2]]));
const page = env.FB_PAGE_ID, token = env.FB_PAGE_TOKEN;
if (!page || !token) { console.error('ใส่ FB_PAGE_ID และ FB_PAGE_TOKEN ใน marketing/.env ก่อน'); process.exit(1); }

async function graph(method, path, params = {}) {
  const body = new URLSearchParams({ ...params, access_token: token });
  const response = method === 'GET'
    ? await fetch(`${GRAPH}/${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` } })
    : await fetch(`${GRAPH}/${path}`, { method, body });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.error) throw new Error(json.error?.message ?? `HTTP ${response.status}`);
  return json;
}

const info = await graph('GET', encodeURIComponent(page), { fields: 'id,name' });
console.log(`OK: token ใช้กับเพจ "${info.name}" (${info.id}) ได้`);
const debug = await graph('GET', 'debug_token', { input_token: token }).catch(() => null);
if (debug?.data) {
  const d = debug.data;
  console.log(`token: type=${d.type} expires=${d.expires_at ? new Date(d.expires_at * 1000).toISOString() : 'never'} scopes=${(d.scopes ?? []).join(',')}`);
  if (!(d.scopes ?? []).includes('pages_manage_posts')) console.warn('ขาดสิทธิ์ pages_manage_posts — ตั้งเวลาโพสต์จะไม่ผ่าน');
}

if (process.argv.includes('--live')) {
  const when = Math.floor(Date.now() / 1000) + 29 * 24 * 3600;
  const post = await graph('POST', `${encodeURIComponent(page)}/feed`, { message: 'ทดสอบระบบตั้งเวลา (จะถูกลบทันที)', published: 'false', scheduled_publish_time: String(when) });
  console.log(`ตั้งเวลาโพสต์ทดสอบได้: ${post.id}`);
  await graph('DELETE', post.id);
  console.log('ลบโพสต์ทดสอบแล้ว — ระบบตั้งเวลาโพสต์พร้อมใช้');
}
