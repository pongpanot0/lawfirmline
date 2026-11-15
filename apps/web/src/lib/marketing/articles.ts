import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLAN_CONFIG, SubscriptionPlan } from '@lawfirm/shared';

export type Inline = { type: 'text' | 'bold'; text: string } | { type: 'link'; text: string; href: string };
export type Block =
  | { type: 'h2'; text: string; id: string }
  | { type: 'h3'; text: string; id: string }
  | { type: 'paragraph'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'faq'; question: string; answer: string };
export type Article = {
  slug: string;
  title: string;
  meta_description: string;
  reviewed: string;
  body: string;
  blocks: Block[];
  minutes: number;
};

export function parseFrontmatter(source: string) {
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
  if (!match) throw new Error('Missing article frontmatter');
  const fields: Record<string, string | boolean | string[]> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([\w_]+):\s*(.*)$/);
    if (!field) throw new Error(`Invalid frontmatter: ${line}`);
    const value = field[2];
    fields[field[1]] =
      value.startsWith('"') || value.startsWith('[') || value === 'true' || value === 'false'
        ? JSON.parse(value)
        : value;
  }
  return { fields, body: source.slice(match[0].length) };
}

export function fillPlaceholders(body: string) {
  return body.replace(/\{\{(.*?)\}\}/g, (_, token: string) => {
    const match = token.match(/^(price|users):([A-Z]+)$/);
    const plan = match && SubscriptionPlan[match[2] as keyof typeof SubscriptionPlan];
    if (!match || !plan || !Object.hasOwn(PLAN_CONFIG, plan)) throw new Error(`Unknown article placeholder: ${token}`);
    return (match[1] === 'price' ? PLAN_CONFIG[plan].priceThb : PLAN_CONFIG[plan].maxUsers).toLocaleString('th-TH');
  });
}

export function parseInline(text: string): Inline[] {
  const result: Inline[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]*)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) result.push({ type: 'text', text: text.slice(last, match.index) });
    if (match[1]) result.push({ type: 'bold', text: match[1] });
    else {
      const href = match[3];
      if (!/^\/(?![\/\\])/.test(href) && !/^https:\/\//.test(href)) throw new Error(`Unsafe article link: ${href}`);
      result.push({ type: 'link', text: match[2], href });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) result.push({ type: 'text', text: text.slice(last) });
  return result;
}

export function parseMarkdown(body: string): Block[] {
  const lines = body.split(/\r?\n/),
    blocks: Block[] = [],
    ids = new Map<string, number>();
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim());
  const special = (line: string) => /^(#{1,3} |[-] |\d+\. |\|)/.test(line);
  for (let i = 0; i < lines.length; ) {
    const line = lines[i].trim();
    if (!line || /^# /.test(line)) {
      i++;
      continue;
    }
    const heading = line.match(/^(##|###) (.+)$/);
    if (heading) {
      const base =
        heading[2]
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s-]/gu, '')
          .trim()
          .replace(/\s+/g, '-') || 'section';
      const count = (ids.get(base) ?? 0) + 1;
      ids.set(base, count);
      blocks.push({
        type: heading[1] === '##' ? 'h2' : 'h3',
        text: heading[2],
        id: count === 1 ? base : `${base}-${count}`,
      });
      i++;
      continue;
    }
    if (line.startsWith('|') && /^\|?\s*:?-{3,}/.test((lines[i + 1] ?? '').trim())) {
      const header = cells(line),
        rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      blocks.push({ type: 'table', header, rows });
      continue;
    }
    const faq = line.match(/^\*\*(.+)\*\*$/);
    if (faq && lines[i + 1]?.trim() && !special(lines[i + 1].trim())) {
      blocks.push({ type: 'faq', question: faq[1], answer: lines[i + 1].trim() });
      i += 2;
      continue;
    }
    const list = line.match(/^(- |\d+\. )(.*)$/);
    if (list) {
      const ordered = list[1] !== '- ',
        items: string[] = [];
      const regex = ordered ? /^\d+\. (.*)$/ : /^- (.*)$/;
      while (i < lines.length) {
        const item = lines[i].trim().match(regex);
        if (!item) break;
        items.push(item[1]);
        i++;
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }
    const paragraph = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !special(lines[i].trim()) && !/^\*\*.+\*\*$/.test(lines[i].trim()))
      paragraph.push(lines[i++].trim());
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }
  // Validate all links during static generation, including content outside the first request.
  for (const block of blocks) {
    const texts =
      block.type === 'table'
        ? [...block.header, ...block.rows.flat()]
        : block.type === 'ul' || block.type === 'ol'
          ? block.items
          : block.type === 'faq'
            ? [block.question, block.answer]
            : [block.text];
    texts.forEach(parseInline);
  }
  return blocks;
}

export function getArticles(directory = join(process.cwd(), 'src/content/articles')): Article[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.md'))
    .flatMap((name) => {
      const { fields, body } = parseFrontmatter(readFileSync(join(directory, name), 'utf8'));
      if (fields.legal_review_required === true) return [];
      const { slug, title, meta_description, reviewed } = fields;
      if (
        typeof slug !== 'string' ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
        typeof title !== 'string' ||
        typeof meta_description !== 'string' ||
        typeof reviewed !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(reviewed) ||
        Number.isNaN(Date.parse(reviewed))
      )
        throw new Error(`Invalid article metadata: ${name}`);
      const filled = fillPlaceholders(body);
      if (filled.includes('{{') || filled.includes('}}')) throw new Error(`Invalid article placeholder: ${name}`);
      return [
        {
          slug,
          title,
          meta_description,
          reviewed,
          body: filled,
          blocks: parseMarkdown(filled),
          minutes: Math.max(1, Math.ceil(filled.replace(/\s/g, '').length / 500)),
        },
      ];
    })
    .sort((a, b) => b.reviewed.localeCompare(a.reviewed) || a.slug.localeCompare(b.slug));
}
export function getArticle(slug: string) {
  return getArticles().find((article) => article.slug === slug);
}
export function articleDate(reviewed: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${reviewed}T00:00:00Z`),
  );
}
