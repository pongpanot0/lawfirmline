#!/usr/bin/env node
/**
 * Turns docs/user-guide/slides.json (written by the Playwright guide suite)
 * into a self-contained slide deck at docs/user-guide/index.html.
 *
 *   node e2e/build-deck.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUIDE = path.resolve(HERE, '../docs/user-guide');
const slides = JSON.parse(fs.readFileSync(path.join(GUIDE, 'slides.json'), 'utf8'));

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slideHtml = (s, i) => `
  <section class="slide" id="slide-${i + 1}" data-index="${i + 1}">
    <header>
      <span class="num">${i + 1} / ${slides.length}</span>
      <h2>${esc(s.title)}</h2>
      <code>${esc(s.route)}</code>
    </header>
    <p class="desc">${esc(s.description)}</p>
    <ol class="callouts">
      ${s.callouts.map((c) => `<li><span class="pin">${c.n}</span>${esc(c.label)}</li>`).join('\n      ')}
    </ol>
    <figure><img src="shots/${esc(s.file)}" alt="${esc(s.title)}" loading="lazy" /></figure>
  </section>`;

const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>LexFlow — คู่มือการใช้งาน</title>
<style>
  :root { --red:#e11d48; --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --bg:#f8fafc; }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:16px/1.6 "Noto Sans Thai",Sarabun,-apple-system,system-ui,sans-serif }
  .wrap { max-width:1100px; margin:0 auto; padding:32px 20px 80px }
  .cover { background:#fff; border:1px solid var(--line); border-radius:18px; padding:40px; margin-bottom:28px }
  .cover h1 { margin:0 0 8px; font-size:32px }
  .cover p { margin:0; color:var(--muted) }
  .toc { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:8px; margin-top:24px }
  .toc a { display:block; padding:10px 12px; background:var(--bg); border:1px solid var(--line);
           border-radius:10px; text-decoration:none; color:var(--ink); font-size:14px }
  .toc a:hover { border-color:var(--red); color:var(--red) }
  .slide { background:#fff; border:1px solid var(--line); border-radius:18px; padding:28px;
           margin-bottom:28px; scroll-margin-top:20px }
  .slide header { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; border-bottom:2px solid var(--red);
                  padding-bottom:12px; margin-bottom:16px }
  .num { background:var(--red); color:#fff; border-radius:999px; padding:3px 11px; font-size:13px; font-weight:700 }
  .slide h2 { margin:0; font-size:22px; flex:1 }
  .slide code { color:var(--muted); font-size:13px }
  .desc { margin:0 0 16px; color:#334155 }
  .callouts { margin:0 0 20px; padding:0; list-style:none; display:grid; gap:8px;
              grid-template-columns:repeat(auto-fill,minmax(280px,1fr)) }
  .callouts li { display:flex; align-items:flex-start; gap:9px; font-size:14px; background:var(--bg);
                 border:1px solid var(--line); border-radius:10px; padding:8px 11px }
  .pin { flex:none; width:22px; height:22px; border-radius:999px; background:var(--red); color:#fff;
         font-size:12px; font-weight:700; display:grid; place-items:center }
  figure { margin:0; border:1px solid var(--line); border-radius:12px; overflow:hidden }
  figure img { display:block; width:100%; height:auto }
  @media print { body{background:#fff} .slide{page-break-after:always; border:none} .toc{display:none} }
</style>
</head>
<body>
<div class="wrap">
  <div class="cover">
    <h1>LexFlow — คู่มือการใช้งานทีละหน้าจอ</h1>
    <p>ภาพหน้าจอทั้งหมดถูกถ่ายอัตโนมัติด้วย Playwright จากระบบจริง กรอบและป้ายสีแดงคือจุดที่ต้องกด/กรอกในแต่ละหน้า</p>
    <nav class="toc">
      ${slides.map((s, i) => `<a href="#slide-${i + 1}">${i + 1}. ${esc(s.title)}</a>`).join('\n      ')}
    </nav>
  </div>
  ${slides.map(slideHtml).join('\n')}
</div>
</body>
</html>`;

fs.writeFileSync(path.join(GUIDE, 'index.html'), html);
console.log(`built ${path.join(GUIDE, 'index.html')} — ${slides.length} slides`);
