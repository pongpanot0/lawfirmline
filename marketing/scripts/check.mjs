import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { validatePosts, selectTopics } from './validate.mjs';
import { renderCards } from './render-cards.mjs';
const marketing = new URL('../',import.meta.url);
const topics = JSON.parse(await readFile(new URL('topics.json',marketing),'utf8'));
const sample = JSON.parse(await readFile(new URL('sample-posts.json',marketing),'utf8'));
assert.equal(topics.length,12);
assert.deepEqual(selectTopics(topics,[]).selected.map(t=>t.id),topics.slice(0,3).map(t=>t.id));
assert.deepEqual(selectTopics(topics,topics.map(t=>t.id)).selected.map(t=>t.id),topics.slice(0,3).map(t=>t.id));
assert.deepEqual(selectTopics(topics,topics.slice(0,11).map(t=>t.id)).selected.map(t=>t.id),[topics[11].id,topics[0].id,topics[1].id]);
assert.deepEqual(selectTopics(topics,topics.slice(0,11).map(t=>t.id)).usedIds,[topics[0].id,topics[1].id]);
validatePosts(sample,topics);
for (const mutate of [
  p=>p.posts.pop(),
  p=>p.posts[0].card.headline='ก'.repeat(41),
  p=>p.posts[0].card.bullets=['ก'.repeat(46)],
  p=>p.posts[0].card.bullets=Array(5).fill('ตรวจ'),
  p=>p.posts[0].body='ก'.repeat(600),
  p=>p.posts[0].hashtags=Array(4).fill('#ศาล'),
  p=>p.posts[0].hashtags=['ไม่ใช่แฮชแท็ก'],
  p=>p.posts[0].topicId='../escape',
  p=>p.posts[1].topicId=p.posts[0].topicId,
  p=>p.posts[0].cardType='other',
  p=>p.posts[0].cta='ติดต่อเรา',
  p=>p.posts[0].unexpected='no',
  p=>p.posts[0].card.headline=' ',
]) {
  const bad = structuredClone(sample); mutate(bad);
  assert.throws(()=>validatePosts(bad,topics));
}
const stress = structuredClone(sample);
// Thai and unbroken wide glyphs at the exact schema limits, no truncation.
const headline='ก่อนออกจากสำนักงานตรวจนัดศาลให้พร้อมทุกวัน';
const bullet='ตรวจวันนัดและผู้รับผิดชอบก่อนส่งต่องานให้ทีม';
const pad=(text,n)=>[...text].slice(0,n).join('').padEnd(n,'ม');
for (const p of stress.posts) p.card={ headline:pad(headline,40), bullets:Array.from({length:4},()=>pad(bullet,45)) };
validatePosts(stress,topics);
const dir = new URL('out/stress/',marketing);
await mkdir(dir,{recursive:true});
await writeFile(new URL('posts.json',dir),JSON.stringify(stress,null,2)+'\n');
console.log('PASS: schema limits, invalid payloads, topic rotation including mid-batch wrap; stress fixture written');
if (process.argv.includes('--render-stress')) {
  console.log((await renderCards(stress,dir.pathname)).join('\n'));
  for (const p of stress.posts) p.card={headline:'ม'.repeat(40),bullets:Array(4).fill('ม'.repeat(45))};
  console.log((await renderCards(stress,new URL('wide/',dir).pathname)).join('\n'));
}
