// 0-baht A/B/C test: schedule the 3 ad concepts as organic Page posts (feed 4:5 image + primary text) at the same
// hour on different days, each with its own UTM link so GA4 shows which concept brought visits.
//   node marketing/ads/schedule-test.mjs <batch-dir> "<ISO time A>" "<ISO time B>" "<ISO time C>"
//   node marketing/ads/schedule-test.mjs <batch-dir> --results     → reactions/comments/shares per post
// Uses FB_PAGE_ID / FB_PAGE_TOKEN from marketing/.env. Scheduled posts can be deleted in Business Suite › Planner.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const GRAPH = 'https://graph.facebook.com/v27.0';
const [dir, ...rest] = process.argv.slice(2);
if (!dir) throw new Error('usage: schedule-test.mjs <batch-dir> <timeA> <timeB> <timeC> | --results');
const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8')).split(/\r?\n/)
  .map(l => l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m => [m[1], m[2]]));
const { FB_PAGE_ID:page, FB_PAGE_TOKEN:token } = env;
if (!page || !token) throw new Error('Set FB_PAGE_ID and FB_PAGE_TOKEN in marketing/.env');
const ledger = join(dir, 'schedule.json');

if (rest[0] === '--results') {
  const posts = JSON.parse(await readFile(ledger, 'utf8'));
  for (const p of posts) {
    const id = p.postId.includes('_') ? p.postId : `${page}_${p.postId}`;
    const r = await fetch(`${GRAPH}/${id}?fields=is_published,created_time,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares`, { headers:{ Authorization:`Bearer ${token}` } });
    const b = await r.json();
    console.log(b.error ? `${p.concept}: ${b.error.message}`
      : `${p.concept}: published=${b.is_published ?? '?'} reactions=${b.reactions?.summary?.total_count ?? 0} comments=${b.comments?.summary?.total_count ?? 0} shares=${b.shares?.count ?? 0}  (visits: GA4 › utm_campaign=${p.campaign}, utm_content=${p.concept})`);
  }
  process.exit(0);
}

// --only=<a|b|c> "<ISO time>": re-schedule one concept (delete its old post in Planner first) and replace its ledger entry.
const only = rest.find(a => a.startsWith('--only='))?.slice(7);
const timeArgs = rest.filter(a => !a.startsWith('--only='));
const concepts = only ? [only] : ['a', 'b', 'c'];
if (only && !['a', 'b', 'c'].includes(only)) throw new Error('--only takes a, b or c');
const times = timeArgs.map(t => Math.floor(new Date(t).getTime() / 1000));
if (times.length !== concepts.length || times.some(Number.isNaN)) throw new Error(`give ${concepts.length} ISO time(s), e.g. 2026-11-16T19:00:00+07:00`);
const now = Date.now() / 1000;
if (times.some(t => t < now + 600 || t > now + 30 * 86400)) throw new Error('each time must be 10 minutes to 30 days ahead (Meta rule)');
let previous = [];
try { previous = JSON.parse(await readFile(ledger, 'utf8')); if (!only) throw new Error(`${ledger} exists — this batch was already scheduled; use --only=<concept> to replace one`); }
catch (e) { if (e.code !== 'ENOENT') throw e; }

const ads = JSON.parse(await readFile(join(dir, 'ads.json'), 'utf8'));
const campaign = `ad-test-${dir.split('/').filter(Boolean).at(-1)}`;
const results = previous.filter(p => !concepts.includes(p.concept));
for (const [i, concept] of concepts.entries()) {
  const ad = ads[concept];
  const link = `https://samnuan.com/?utm_source=facebook&utm_medium=organic&utm_campaign=${campaign}&utm_content=${concept}`;
  const caption = ad.primaryText.replace(/ดูรายละเอียดที่ samnuan\.com\s*$/, '').trimEnd() + `\n\nดูรายละเอียด ${link}\n\n#สำนวน #ทนายความ #สำนักงานกฎหมาย`;
  const form = new FormData();
  form.set('source', new Blob([await readFile(join(dir, 'out', `${concept}-feed.png`))], { type:'image/png' }), `${concept}-feed.png`);
  form.set('caption', caption);
  form.set('published', 'false');
  form.set('scheduled_publish_time', String(times[i]));
  form.set('access_token', token);
  const r = await fetch(`${GRAPH}/${page}/photos`, { method:'POST', body:form });
  const b = await r.json();
  if (b.error) { console.error(`${concept}: ${b.error.message}`); results.push({ concept, error:b.error.message }); continue; }
  results.push({ concept, postId:b.post_id ?? b.id, at:new Date(times[i] * 1000).toISOString(), campaign, link });
  console.log(`${concept}: scheduled ${new Date(times[i] * 1000).toLocaleString('th-TH', { timeZone:'Asia/Bangkok' })}`);
}
results.sort((x, y) => x.concept.localeCompare(y.concept));
await writeFile(ledger, JSON.stringify(results, null, 2) + "\n");
