import { readFile } from 'node:fs/promises';
export const schema = JSON.parse(await readFile(new URL('../schema/posts.schema.json', import.meta.url), 'utf8'));
// Validate the small subset of JSON Schema used by this kit, including unknown keys.
function check(value, rule, path = '$') {
  const fail = message => { throw new Error(`${path}: ${message}`); };
  if (rule.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected object');
    for (const key of rule.required) if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
    for (const key of Object.keys(value)) {
      if (!rule.properties[key]) fail(`unknown key ${key}`);
      check(value[key], rule.properties[key], `${path}.${key}`);
    }
  } else if (rule.type === 'array') {
    if (!Array.isArray(value)) fail('expected array');
    if (value.length < (rule.minItems ?? 0) || value.length > rule.maxItems) fail('wrong item count');
    value.forEach((item, i) => check(item, rule.items, `${path}[${i}]`));
  } else if (rule.type === 'string') {
    if (typeof value !== 'string' || !value.trim()) fail('expected nonempty text');
    if ([...value].length > (rule.maxLength ?? Infinity)) fail('text too long');
    if (rule.enum && !rule.enum.includes(value)) fail('unsupported value');
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) fail('invalid format');
  } else fail('unsupported schema rule');
}
export function validatePosts(data, topics) {
  check(data, schema);
  if (new Set(data.posts.map(p => p.topicId)).size !== 3) throw new Error('Duplicate topic ids');
  for (const post of data.posts) {
    if ([...post.hook + post.body].length > 350) throw new Error("Hook + body must be <=350 characters");
    if (!/samnuan\.com|LINE OA/.test(post.cta)) throw new Error('CTA must mention samnuan.com or LINE OA');
    if (!/^[a-z0-9-]+$/.test(post.topicId)) throw new Error('Unsafe topic id');
    if (topics && !topics.some(t => t.id === post.topicId && t.cardType === post.cardType)) throw new Error('Unexpected topic or card type');
  }
  return data;
}
export function selectTopics(topics, used) {
  if (topics.length < 3 || new Set(topics.map(t => t.id)).size !== topics.length) throw new Error('Need at least 3 unique topics');
  let ids = [...used];
  const selected = [];
  while (selected.length < 3) {
    let next = topics.find(t => !ids.includes(t.id) && !selected.some(s => s.id === t.id));
    if (!next) { ids = []; next = topics.find(t => !selected.some(s => s.id === t.id)); }
    selected.push(next); ids.push(next.id);
  }
  return { selected, usedIds: ids };
}
