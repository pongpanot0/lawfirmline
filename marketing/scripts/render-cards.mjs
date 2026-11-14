import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validatePosts } from './validate.mjs';
// Load one template with card data, fit + overflow-check the text, screenshot to path.
async function renderOne(page, template, card, path) {
  const url = new URL(`../templates/card-${template}.html`, import.meta.url);
  url.searchParams.set('data', JSON.stringify(card));
  await page.goto(url.href);
  await page.evaluate(async () => {
    await Promise.all([document.fonts.load('500 60px Trirong', 'สำนักงาน'), document.fonts.load('400 38px "Noto Sans Thai"', 'สำนักงาน')]);
    await document.fonts.ready;
    await window.__photoReady;
    if (!document.fonts.check('500 60px Trirong') || !document.fonts.check('400 38px "Noto Sans Thai"')) throw new Error('Google Fonts did not load');
    const section = document.querySelector('section');
    // Long text: shrink headline + bullets in 5% steps (floor 60%) until it fits; the guard below still rejects anything that doesn't.
    const sized = [...document.querySelectorAll('h1, li')].map(el => [el, parseFloat(getComputedStyle(el).fontSize)]);
    for (let scale = 0.95; section.scrollHeight > section.clientHeight && scale >= 0.6; scale -= 0.05) {
      for (const [el, size] of sized) el.style.fontSize = `${size * scale}px`;
    }
    const footer = document.querySelector('footer').getBoundingClientRect();
    const elements = [...document.querySelectorAll('h1, li, li span, header, footer')];
    if (section.scrollHeight > section.clientHeight || elements.some(el => {
      const r = el.getBoundingClientRect();
      return el.scrollWidth > el.clientWidth + 1 || r.left < 0 || r.right > 1080 || r.bottom > 1350 || (el.matches('h1, li') && r.bottom > footer.top);
    })) throw new Error('Card text overflow');
  });
  await page.screenshot({ path });
}

// Promo: AI photo (absolute file path) behind the post's card headline.
export async function renderPromo(post, photoPath, path) {
  const browser = await chromium.launch({ headless:true });
  try {
    const page = await browser.newPage({ viewport:{ width:1080, height:1350 }, deviceScaleFactor:1 });
    await renderOne(page, 'promo', { headline:post.card.headline, bullets:[], photo:pathToFileURL(photoPath).href }, path);
  } finally { await browser.close(); }
  return path;
}

export async function renderCards(data, output) {
  validatePosts(data);
  await mkdir(output, { recursive:true });
  const browser = await chromium.launch({ headless:true });
  const paths = [];
  try {
    const page = await browser.newPage({ viewport:{ width:1080, height:1350 }, deviceScaleFactor:1 });
    for (const [index, post] of data.posts.entries()) {
      const path = join(output, `${index + 1}-${post.topicId}.png`);
      await renderOne(page, post.cardType, post.card, path);
      paths.push(path);
    }
  } finally { await browser.close(); }
  return paths;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , input, output] = process.argv;
  if (!input || !output) throw new Error('Usage: node marketing/scripts/render-cards.mjs posts.json output-directory');
  console.log((await renderCards(JSON.parse(await readFile(input, 'utf8')), resolve(output))).join('\n'));
}
