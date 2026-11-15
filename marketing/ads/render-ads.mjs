import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = new URL('./2026-11-15/', import.meta.url);
const out = new URL('./out/', root);
const types = { html:'text/html; charset=utf-8', json:'application/json; charset=utf-8', png:'image/png' };
let browser;
try {
  browser = await chromium.launch({ headless:true });
  await mkdir(out, { recursive:true });
  for (const concept of ['a','b','c']) {
    for (const [format, height] of Object.entries({ feed:1350, square:1080, story:1920 })) {
      const page = await browser.newPage({ viewport:{ width:1080, height }, deviceScaleFactor:1 });
      try {
        // Fulfil local assets in Playwright; no listening port or publishing service.
        await page.route('http://samnuan-ad.test/**', async route => {
          const name = new URL(route.request().url()).pathname.slice(1);
          if (!/^(ad\.html|ads\.json|bg-[abc]\.png)$/.test(name)) { await route.fulfill({ status:404 }); return; }
          try {
            await route.fulfill({ body:await readFile(new URL(name, root)), contentType:types[name.split('.').pop()] });
          } catch { await route.fulfill({ status:404 }); }
        });
        await page.goto(`http://samnuan-ad.test/ad.html?c=${concept}&f=${format}`);
        await page.waitForFunction(() => Boolean(window.adReady), null, { timeout:15000 });
        await page.evaluate(() => window.adReady);
        const errors = await page.evaluate(() => {
          const canvas = document.querySelector('#ad').getBoundingClientRect();
          const problems = [];
          const inside = (r, box) => r.left >= box.left - .5 && r.top >= box.top - .5 && r.right <= box.right + .5 && r.bottom <= box.bottom + .5;
          let area = 0;
          for (const element of document.querySelectorAll('[data-text]')) {
            const box = element.getBoundingClientRect();
            // Thai marks and Trirong ascenders legitimately poke past the line box, so only flag what a viewer would see:
            // text leaving the canvas or wider than its own box.
            if (!inside(box, canvas) || element.scrollWidth > element.clientWidth + 1) problems.push(`${element.id || element.className}: overflow`);
            if (document.querySelector('#ad').classList.contains('story') && (box.top < 250 || box.bottom > canvas.height - 340)) problems.push('Story safe-zone violation');
            area += box.width * box.height;
          }
          if (area / (canvas.width * canvas.height) > .30) problems.push('Text boxes cover more than 30%');
          return problems;
        });
        if (errors.length) throw new Error(`${concept}/${format}: ${errors.join('; ')}`);
        const target = fileURLToPath(new URL(`${concept}-${format}.png`, out));
        await page.screenshot({ path:target });
        console.log(`Rendered ${concept}/${format}: 1080×${height}; fonts, background, overflow, text area and safe zones passed`);
      } finally { await page.close(); }
    }
  }
} finally {
  await browser?.close();
}
