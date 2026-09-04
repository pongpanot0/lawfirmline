import { Page } from '@playwright/test';
import { PII_TEXT_PATTERNS } from '@lawfirm/shared';
import fs from 'node:fs';
import path from 'node:path';

export const GUIDE_DIR = path.resolve(__dirname, '../../docs/user-guide');
export const SHOTS_DIR = path.join(GUIDE_DIR, 'shots');
const MANIFEST = path.join(GUIDE_DIR, 'slides.json');

export interface Callout {
  /** Any Playwright selector (CSS, :has-text(), text=, role=...) */
  selector: string;
  /** Thai caption shown inside the red badge */
  label: string;
  /** where to hang the badge relative to the red box */
  place?: 'top' | 'bottom' | 'left' | 'right';
  /** annotate the nth match (default 0) */
  nth?: number;
}

export interface SlideMeta {
  id: string;
  title: string;
  route: string;
  description: string;
  file: string;
  callouts: { n: number; label: string; found: boolean }[];
}

interface Box {
  n: number;
  label: string;
  place?: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

const collected: SlideMeta[] = [];

/**
 * Rewrite every email / phone / national-ID occurrence in the rendered page to
 * its masked form, plus the value of any PII-ish input. The guide is meant to
 * be shared, so no screenshot may carry a real identifier — masking happens in
 * the DOM before the shutter, not as a post-process on the PNG.
 */
export async function maskPii(page: Page) {
  await page.evaluate(
    ({ emailSrc, phoneSrc, idSrc }) => {
      const email = new RegExp(emailSrc, 'g');
      const phone = new RegExp(phoneSrc, 'g');
      const nid = new RegExp(idSrc, 'g');

      const edges = (p: string) => (p.length <= 2 ? `${p[0] ?? ''}*` : `${p[0]}***${p[p.length - 1]}`);
      const maskEmail = (v: string) => {
        const m = /^([^@\s]+)@([^@\s]+)$/.exec(v.trim());
        if (!m) return v;
        const dot = m[2].indexOf('.');
        const label = dot === -1 ? m[2] : m[2].slice(0, dot);
        const tld = dot === -1 ? '' : m[2].slice(dot);
        return `${edges(m[1])}@${edges(label)}${tld}`;
      };
      const maskDigits = (v: string) => {
        const d = v.replace(/\D/g, '');
        return d.length <= 4 ? '*'.repeat(d.length) : '*'.repeat(d.length - 4) + d.slice(-4);
      };
      const scrub = (t: string) =>
        t.replace(email, maskEmail).replace(nid, maskDigits).replace(phone, maskDigits);

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let n: Node | null;
      while ((n = walker.nextNode())) nodes.push(n as Text);
      for (const node of nodes) {
        const next = scrub(node.nodeValue || '');
        if (next !== node.nodeValue) node.nodeValue = next;
      }

      document.querySelectorAll('input,textarea').forEach((el) => {
        const i = el as HTMLInputElement;
        if (i.value) i.value = scrub(i.value);
        if (i.placeholder) i.setAttribute('placeholder', scrub(i.placeholder));
      });
    },
    {
      emailSrc: PII_TEXT_PATTERNS.email.source,
      phoneSrc: PII_TEXT_PATTERNS.phone.source,
      idSrc: PII_TEXT_PATTERNS.nationalId.source,
    },
  );
}

/** Freeze animations and let the page settle before shooting. */
export async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page
    .addStyleTag({
      content: `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`,
    })
    .catch(() => {});
  await page.waitForTimeout(400);
}

/** Resolve a callout to absolute document coordinates, or null if not on screen. */
async function measure(page: Page, c: Callout, n: number): Promise<Box | null> {
  try {
    const loc = page.locator(c.selector).nth(c.nth ?? 0);
    if ((await loc.count()) === 0) return null;
    const geo = await loc.evaluate((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return {
        top: r.top + window.scrollY,
        left: r.left + window.scrollX,
        width: r.width,
        height: r.height,
      };
    });
    if (geo.width < 2 || geo.height < 2) return null;
    return { n, label: c.label, place: c.place, ...geo };
  } catch {
    return null;
  }
}

/**
 * Draw red callout boxes + numbered red badges over the page and save a
 * full-page screenshot into docs/user-guide/shots.
 */
export async function capture(
  page: Page,
  slide: { id: string; title: string; route: string; description: string; callouts: Callout[] },
): Promise<SlideMeta> {
  await settle(page);
  await maskPii(page);

  const boxes: Box[] = [];
  const results: SlideMeta['callouts'] = [];
  for (let i = 0; i < slide.callouts.length; i++) {
    const box = await measure(page, slide.callouts[i], boxes.length + 1);
    results.push({ n: box ? box.n : 0, label: slide.callouts[i].label, found: !!box });
    if (box) boxes.push(box);
  }

  await page.evaluate(
    ({ boxes, title }) => {
      document.querySelectorAll('[data-guide-overlay]').forEach((n) => n.remove());
      const root = document.createElement('div');
      root.setAttribute('data-guide-overlay', '');
      root.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:0;z-index:2147483000;pointer-events:none';
      document.body.appendChild(root);
      const pad = 6;

      const placed: { t: number; l: number; b: number; r: number }[] = [];
      const overlaps = (t: number, l: number, w: number, h: number) =>
        placed.some((p) => !(t + h < p.t || t > p.b || l + w < p.l || l > p.r));

      for (const b of boxes) {
        const box = document.createElement('div');
        box.style.cssText = [
          'position:absolute',
          'border:3px solid #e11d48',
          'border-radius:10px',
          'box-shadow:0 0 0 3px rgba(225,29,72,.16)',
          `top:${b.top - pad}px`,
          `left:${b.left - pad}px`,
          `width:${b.width + pad * 2}px`,
          `height:${b.height + pad * 2}px`,
        ].join(';');
        root.appendChild(box);

        const badge = document.createElement('div');
        badge.textContent = `${b.n}. ${b.label}`;
        badge.style.cssText = [
          'position:absolute',
          'background:#e11d48',
          'color:#fff',
          'font:600 13px/1.35 "Noto Sans Thai",Sarabun,system-ui,sans-serif',
          'padding:5px 10px',
          'border-radius:8px',
          'white-space:nowrap',
          'box-shadow:0 2px 8px rgba(0,0,0,.28)',
          'top:-9999px;left:-9999px',
        ].join(';');
        root.appendChild(badge);
        const bw = badge.offsetWidth;
        const bh = badge.offsetHeight;
        const docW = document.documentElement.scrollWidth;

        const candidates: [number, number][] = [];
        const above: [number, number] = [b.top - pad - bh - 8, b.left - pad];
        const below: [number, number] = [b.top + b.height + pad + 8, b.left - pad];
        const right: [number, number] = [b.top + b.height / 2 - bh / 2, b.left + b.width + pad + 10];
        const left: [number, number] = [b.top + b.height / 2 - bh / 2, b.left - pad - bw - 10];
        const order: Record<string, [number, number][]> = {
          top: [above, right, below, left],
          bottom: [below, right, above, left],
          right: [right, above, below, left],
          left: [left, above, below, right],
        };
        candidates.push(...(order[b.place || 'top'] || order.top));

        let pos = candidates[0];
        for (const c of candidates) {
          if (c[0] < 2 || c[1] < 2 || c[1] + bw > docW) continue;
          if (overlaps(c[0], c[1], bw, bh)) continue;
          pos = c;
          break;
        }
        let [bt, bl] = pos;
        bt = Math.max(2, bt);
        bl = Math.min(Math.max(2, bl), Math.max(2, docW - bw - 4));
        badge.style.top = `${bt}px`;
        badge.style.left = `${bl}px`;
        placed.push({ t: bt, l: bl, b: bt + bh, r: bl + bw });
      }

      if (title) {
        const bar = document.createElement('div');
        bar.textContent = title;
        bar.style.cssText = [
          'position:absolute',
          'top:0;left:0;width:100%',
          'background:#e11d48',
          'color:#fff',
          'font:700 15px/1.2 "Noto Sans Thai",Sarabun,system-ui,sans-serif',
          'padding:12px 18px',
          'box-sizing:border-box',
        ].join(';');
        root.appendChild(bar);
      }
    },
    { boxes, title: slide.title },
  );

  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const file = `${slide.id}.png`;
  await page.screenshot({ path: path.join(SHOTS_DIR, file), fullPage: true });
  await page.evaluate(() =>
    document.querySelectorAll('[data-guide-overlay]').forEach((n) => n.remove()),
  );

  const meta: SlideMeta = { ...slide, file, callouts: results.filter((r) => r.found) };
  collected.push(meta);
  writeManifest();
  return meta;
}

/** Wipe the manifest so a fresh run rebuilds slides in run order. */
export function resetManifest() {
  collected.length = 0;
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST, '[]');
}

function writeManifest() {
  let existing: SlideMeta[] = [];
  try {
    existing = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch {
    existing = [];
  }
  const byId = new Map(existing.map((s) => [s.id, s]));
  collected.forEach((s) => byId.set(s.id, s));
  const all = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(MANIFEST, JSON.stringify(all, null, 2));
}
