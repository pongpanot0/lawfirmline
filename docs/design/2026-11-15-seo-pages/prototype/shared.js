/* Samnuan marketing prototype — shared tokens, data, app panels and motion.
 * Design-only artifact (docs/design). Facts: docs/seo/2026-11-15-landing-pages-fact-sheet.md.
 * Demo names are fictional on purpose. */

tailwind.config = {
  theme: {
    extend: {
      colors: {
        paper: '#F7F4ED', surface: '#FFFDFA', sunk: '#F0EDE6', rule: '#DFE0DC',
        ink: '#142E43', 'ink-2': '#52616B', brass: '#8B6D32', 'brass-soft': '#F3EBDD',
        ok: '#2F6B4F', 'ok-soft': '#E6F0EA', warn: '#9A3B2E', 'warn-soft': '#F6E5E1',
      },
      fontFamily: { display: ['Trirong', 'serif'], sans: ['"Noto Sans Thai"', 'Inter', 'system-ui', 'sans-serif'] },
    },
  },
};

/* ---------- the six stages of one case ---------- */
const STAGES = [
  { key: 'cases', label: 'เปิดสำนวนและเก็บเอกสาร', href: 'feature.html?f=cases',
    line: 'ข้อมูลคดี เอกสาร และความเคลื่อนไหวทั้งหมดอยู่ในหน้าเดียว ค้นได้จากชื่อลูกความหรือเลขคดี' },
  { key: 'calendar', label: 'นัดศาลและปฏิทินทีม', href: 'feature.html?f=calendar',
    line: 'นัดศาล ประชุม และวันลาของทุกคนอยู่ในปฏิทินเดียว ก่อนรับนัดใหม่ก็รู้ทันทีว่าใครติดศาล' },
  { key: 'deadlines', label: 'กำหนดเวลาคดี', href: 'feature.html?f=deadlines',
    line: 'ระบบเสนอวันครบกำหนดตามประเภทคดี นับข้ามเสาร์-อาทิตย์และวันหยุดราชการ ทนายตรวจและยืนยันเอง' },
  { key: 'team', label: 'มอบหมายงานในทีม', href: 'feature.html?f=team',
    line: 'ทุกงานมีผู้รับผิดชอบและกำหนดส่ง หัวหน้ารู้ว่างานค้างอยู่ที่ใครโดยไม่ต้องเดินไปถาม' },
  { key: 'portal', label: 'อัปเดตลูกความ', href: 'feature.html?f=portal',
    line: 'ลูกความเปิดดูสถานะคดี วันนัด และเอกสารได้เองในพอร์ทัล ทีมไม่ต้องรับสายถามเรื่องเดิมทุกวัน' },
  { key: 'billing', label: 'ใบแจ้งหนี้และรับชำระ', href: 'feature.html?f=billing',
    line: 'ออกใบแจ้งหนี้จากสำนวนได้เลย ระบบแยก VAT งานคดีกับงานที่ปรึกษาให้ บันทึกหัก ณ ที่จ่ายตอนรับเงิน และออกใบเสร็จทุกงวด' },
];

const chip = (t, tone = 'n') => {
  const c = { n: 'bg-sunk text-ink-2 border-rule', b: 'bg-brass-soft text-brass border-brass/30',
    ok: 'bg-ok-soft text-ok border-ok/25', w: 'bg-warn-soft text-warn border-warn/25' }[tone];
  return `<span class="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${c}">${t}</span>`;
};
const caseHead = (title, sub) => `
  <div class="flex flex-wrap items-start justify-between gap-3 border-b border-rule pb-4">
    <div><p class="font-display text-lg font-semibold text-ink">${title}</p><p class="mt-1 text-xs text-ink-2">${sub}</p></div>
    ${chip('คดีแพ่งสามัญ · ชั้นให้การ')}
  </div>`;
const row = (inner, extra = '') => `<div class="tour-row flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rule bg-surface p-4 ${extra}">${inner}</div>`;

/* App panels: one per stage. Plain flat UI, no fake window chrome. */
const PANELS = {
  cases: `
    ${caseHead('ผบ. 1234/2569 · ศาลแพ่งกรุงเทพใต้', 'โจทก์: บริษัท ตัวอย่างขนส่ง จำกัด · จำเลย: บริษัท ตัวอย่างประกันภัย จำกัด')}
    <div class="mt-5 grid gap-5 md:grid-cols-5">
      <div class="md:col-span-3">
        <p class="mb-2 text-xs font-semibold text-ink-2">เอกสารในสำนวน</p>
        <ul class="divide-y divide-rule rounded-lg border border-rule bg-surface text-sm">
          <li class="tour-row flex items-center justify-between px-4 py-3"><span class="text-ink">คำฟ้อง.pdf</span><span class="text-xs text-ink-2">2 พ.ย.</span></li>
          <li class="tour-row flex items-center justify-between px-4 py-3"><span class="text-ink">สัญญาว่าจ้างขนส่ง.pdf</span><span class="text-xs text-ink-2">2 พ.ย.</span></li>
          <li class="tour-row flex items-center justify-between px-4 py-3"><span class="text-ink">หมายเรียกและสำเนาคำฟ้อง.pdf</span>${chip('ใหม่', 'b')}</li>
        </ul>
      </div>
      <div class="md:col-span-2">
        <p class="mb-2 text-xs font-semibold text-ink-2">ความเคลื่อนไหว</p>
        <ol class="space-y-3 border-l border-rule pl-4 text-xs text-ink-2">
          <li class="tour-row"><span class="font-medium text-ink">รับหมายเรียก</span><br>17 พ.ย. · ทนายสมศักดิ์</li>
          <li class="tour-row"><span class="font-medium text-ink">ยื่นฟ้อง</span><br>2 พ.ย. · ทนายสมศักดิ์</li>
          <li class="tour-row"><span class="font-medium text-ink">เปิดสำนวน</span><br>28 ต.ค. · ธุรการ</li>
        </ol>
      </div>
    </div>`,
  calendar: `
    <div class="flex items-center justify-between border-b border-rule pb-4">
      <p class="font-display text-lg font-semibold text-ink">ปฏิทินทีม · 16–20 พ.ย. 2569</p>${chip('สัปดาห์นี้')}
    </div>
    <div class="-mx-1 mt-5 overflow-x-auto px-1 pb-1"><div class="grid min-w-[620px] grid-cols-5 gap-2 text-xs">
      ${[['จ.', 16, [['09:00 นัดสืบพยาน', 'ศาลแพ่งกรุงเทพใต้', 'b']]],
         ['อ.', 17, [['13:30 นัดไกล่เกลี่ย', 'ศาลแรงงานกลาง', 'b']]],
         ['พ.', 18, [['15:00 ประชุมลูกความ', 'ห้องประชุม 1', 'n'], ['ลา · คุณนภา', 'ทั้งวัน', 'w']]],
         ['พฤ.', 19, [['09:30 ชี้สองสถาน', 'ศาลแพ่ง', 'b']]],
         ['ศ.', 20, []]]
        .map(([d, n, ev]) => `<div class="min-h-[190px] rounded-lg border border-rule bg-surface p-2">
          <p class="mb-2 flex justify-between text-ink-2"><span>${d}</span><span class="font-semibold text-ink">${n}</span></p>
          ${ev.map(([t, s, tone]) => `<div class="tour-row mb-2 rounded ${tone === 'b' ? 'bg-brass-soft' : tone === 'w' ? 'bg-warn-soft' : 'bg-sunk'} p-1.5"><p class="flex items-center gap-1.5 font-medium text-ink"><span class="h-1.5 w-1.5 shrink-0 rounded-full ${tone === 'b' ? 'bg-brass' : tone === 'w' ? 'bg-warn' : 'bg-ink-2'}"></span>${t}</p><p class="text-ink-2">${s}</p></div>`).join('')}
        </div>`).join('')}
    </div></div>
    <p class="mt-3 text-xs text-ink-2">ทนายสมศักดิ์ติดศาลวันจันทร์และพฤหัส · คุณนภาลาวันพุธ</p>`,
  deadlines: `
    ${caseHead('ผบ. 1234/2569 · ศาลแพ่งกรุงเทพใต้', 'กำหนดเวลาที่ระบบเสนอจากวันรับหมาย 17 พ.ย. 2569')}
    <div class="mt-5 space-y-3">
      ${row(`<div><p class="flex items-center gap-2 font-medium text-ink"><span class="h-2 w-2 rounded-full bg-brass pulse-once"></span>ยื่นคำให้การ · ครบ 2 ธ.ค. 2569</p>
        <p class="mt-1 pl-4 text-xs text-ink-2">15 วันนับจากวันรับหมาย ข้ามเสาร์-อาทิตย์และวันหยุดราชการ</p></div>
        <button class="whitespace-nowrap rounded-md bg-ink px-4 py-2 text-xs font-medium text-paper">ยืนยันวัน</button>`, 'border-brass/40')}
      ${row(`<div><p class="font-medium text-ink">ยื่นบัญชีระบุพยาน · 7 วันก่อนวันสืบ</p><p class="mt-1 text-xs text-ink-2">คำนวณจากวันนัดสืบพยานในปฏิทิน</p></div>${chip('ยืนยันแล้ว', 'ok')}`)}
      ${row(`<div><p class="font-medium text-ink">อุทธรณ์ · ภายใน 1 เดือน</p><p class="mt-1 text-xs text-ink-2">เริ่มนับเมื่อบันทึกวันอ่านคำพิพากษา</p></div>${chip('ยังไม่ถึงขั้นนี้')}`)}
    </div>`,
  team: `
    <div class="flex items-center justify-between border-b border-rule pb-4">
      <p class="font-display text-lg font-semibold text-ink">งานของทีม · สัปดาห์นี้</p>${chip('ค้างอยู่ 7 งาน')}
    </div>
    <div class="mt-5 grid gap-3 md:grid-cols-3 text-sm">
      ${[['ต้องทำ', [['ร่างคำให้การ ผบ. 1234/2569', 'ทนายสมศักดิ์ · ส่ง 28 พ.ย.'], ['ขอคัดถ่ายสำนวน', 'ธุรการวิภา · ส่ง 20 พ.ย.']]],
         ['กำลังทำ', [['ตรวจสัญญาเช่า ลูกความใหม่', 'ทนายกมล · ส่ง 19 พ.ย.'], ['เตรียมพยานเอกสาร', 'ทนายสมศักดิ์ · ส่ง 24 พ.ย.']]],
         ['รอตรวจ', [['หนังสือบอกกล่าวทวงถาม', 'ทนายกมล → หัวหน้า']]]]
        .map(([h, items]) => `<div class="rounded-lg border border-rule bg-sunk/60 p-3"><p class="mb-2 text-xs font-semibold text-ink-2">${h}</p>
          ${items.map(([t, s]) => `<div class="tour-row mb-2 rounded-md border border-rule bg-surface p-3"><p class="font-medium text-ink">${t}</p><p class="mt-1 text-xs text-ink-2">${s}</p></div>`).join('')}</div>`).join('')}
    </div>`,
  portal: `
    <div class="grid gap-5 md:grid-cols-5">
      <div class="md:col-span-3 rounded-lg border border-rule bg-surface p-5">
        <p class="text-xs text-ink-2">พอร์ทัลลูกความ · บริษัท ตัวอย่างขนส่ง จำกัด</p>
        <p class="mt-1 font-display text-lg font-semibold text-ink">ผบ. 1234/2569</p>
        <ol class="mt-4 space-y-3 text-sm">
          <li class="tour-row flex gap-3"><span class="mt-1.5 h-2 w-2 rounded-full bg-ok"></span><div><p class="text-ink">ยื่นฟ้องแล้ว</p><p class="text-xs text-ink-2">2 พ.ย. 2569</p></div></li>
          <li class="tour-row flex gap-3"><span class="mt-1.5 h-2 w-2 rounded-full bg-brass"></span><div><p class="text-ink">จำเลยอยู่ระหว่างยื่นคำให้การ</p><p class="text-xs text-ink-2">อัปเดตล่าสุด 17 พ.ย.</p></div></li>
          <li class="tour-row flex gap-3"><span class="mt-1.5 h-2 w-2 rounded-full bg-rule"></span><div><p class="text-ink">นัดสืบพยาน</p><p class="text-xs text-ink-2">15 ม.ค. 2570 · 09:00</p></div></li>
        </ol>
      </div>
      <div class="md:col-span-2 space-y-3">
        <p class="text-xs font-semibold text-ink-2">ข้อความถึงลูกความ</p>
        <div class="tour-row rounded-lg border border-rule bg-surface p-3 text-sm text-ink">มีเอกสารใหม่ในคดีของคุณ: หมายเรียกและสำเนาคำฟ้อง</div>
        <div class="tour-row rounded-lg border border-rule bg-surface p-3 text-sm text-ink">นัดสืบพยาน 15 ม.ค. 2570 เวลา 09:00 ศาลแพ่งกรุงเทพใต้</div>
        <p class="text-xs text-ink-2">ลูกความที่เข้าพอร์ทัลไม่นับเป็นผู้ใช้</p>
      </div>
    </div>`,
  billing: `
    <div class="flex flex-wrap items-start justify-between gap-3 border-b border-rule pb-4">
      <div><p class="text-xs text-ink-2">ใบแจ้งหนี้ / Invoice</p><p class="font-display text-lg font-semibold text-ink">INV-2569-0142</p></div>
      ${chip('รอชำระ · ครบ 30 พ.ย.', 'b')}
    </div>
    <table class="mt-4 w-full text-sm">
      <thead><tr class="border-b border-rule text-left text-xs text-ink-2"><th class="py-2 font-medium">รายการ</th><th class="py-2 font-medium">ภาษี</th><th class="py-2 text-right font-medium">จำนวนเงิน</th></tr></thead>
      <tbody class="divide-y divide-rule">
        <tr class="tour-row"><td class="py-2.5 text-ink">ค่าวิชาชีพว่าความ งวดที่ 2</td><td>${chip('ยกเว้น VAT')}</td><td class="text-right tabular-nums text-ink">30,000.00</td></tr>
        <tr class="tour-row"><td class="py-2.5 text-ink">ค่าที่ปรึกษากฎหมาย</td><td>${chip('VAT 7%', 'b')}</td><td class="text-right tabular-nums text-ink">20,000.00</td></tr>
        <tr class="tour-row"><td class="py-2.5 text-ink">ค่าธรรมเนียมศาล (ทดรองจ่าย)</td><td>${chip('ค่าใช้จ่ายแทน')}</td><td class="text-right tabular-nums text-ink">2,100.00</td></tr>
      </tbody>
    </table>
    <div class="mt-3 ml-auto max-w-xs space-y-1 text-sm">
      <p class="flex justify-between text-ink-2"><span>VAT 7%</span><span class="tabular-nums">1,400.00</span></p>
      <p class="flex justify-between border-t border-rule pt-1 font-semibold text-ink"><span>รวม</span><span class="tabular-nums count" data-to="53500">53,500.00</span></p>
    </div>`,
};

/* ---------- shared chrome ---------- */
function navHTML(active) {
  const link = (t, h, k) => `<a href="${h}" class="whitespace-nowrap pb-1 text-sm ${active === k ? 'border-b-2 border-brass text-ink' : 'text-ink-2 hover:text-ink'}">${t}</a>`;
  return `<header class="sticky top-0 z-50 border-b border-rule bg-paper/95 backdrop-blur">
    <div class="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-4 md:px-6">
      <a href="index.html" class="flex items-center gap-2.5"><span class="flex h-9 w-9 items-center justify-center rounded-lg bg-ink font-display font-semibold text-paper">ส</span><span class="font-display text-lg font-semibold tracking-tight text-ink">SAMNUAN</span></a>
      <nav class="hidden items-center gap-8 md:flex">${link('ฟีเจอร์', 'index.html#tour', 'features')}${link('ราคา', '#', 'pricing')}${link('บทความ', '#', 'articles')}</nav>
      <div class="flex items-center gap-4">
        <span class="hidden text-sm text-ink-2 sm:inline"><b class="text-ink">TH</b> | EN</span>
        <a href="#" class="hidden whitespace-nowrap text-sm text-ink sm:inline">เข้าสู่ระบบ</a>
        <a href="#" class="btn-primary whitespace-nowrap rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper">ทดลองใช้ฟรี</a>
      </div>
    </div></header>`;
}
function ctaHTML(title) {
  return `<section class="mx-auto my-20 max-w-[1240px] px-4 md:px-6 reveal">
    <div class="rounded-2xl bg-ink px-6 py-14 text-center md:py-16">
      <h2 class="font-display text-3xl font-semibold text-paper md:text-4xl">${title}</h2>
      <p class="mx-auto mt-3 max-w-xl text-[#C9D3DA]">ทดลองใช้ฟรี 30 วัน ไม่ต้องใช้บัตรเครดิต</p>
      <a href="#" class="btn-primary mt-8 inline-block whitespace-nowrap rounded-lg bg-paper px-8 py-3.5 font-semibold text-ink">ทดลองใช้ฟรี 30 วัน</a>
    </div></section>`;
}
function footerHTML() {
  return `<footer class="border-t border-rule"><div class="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-4 px-4 py-10 text-sm text-ink-2 md:flex-row md:px-6">
    <span class="flex items-center gap-2"><span class="flex h-7 w-7 items-center justify-center rounded bg-ink font-display text-xs text-paper">ส</span>© Samnuan</span>
    <span class="flex gap-6"><a href="#" class="whitespace-nowrap hover:text-ink">นโยบายความเป็นส่วนตัว</a><a href="#" class="whitespace-nowrap hover:text-ink">ขอลบบัญชี</a></span>
  </div></footer>`;
}

/* ---------- the case tour: auto-advances while visible, click/tap takes over ---------- */
function tourHTML(activeKey) {
  return `<div class="tour grid items-start gap-8 lg:grid-cols-12" data-active="${activeKey}">
    <ol class="tour-list lg:col-span-4 lg:sticky lg:top-24 divide-y divide-rule border-y border-rule">
      ${STAGES.map((s, i) => `<li><button type="button" class="tour-step group w-full rounded-lg px-4 py-4 text-left" data-key="${s.key}" aria-controls="panel-${s.key}">
        <span class="flex items-baseline gap-3"><span class="step-num text-xs tabular-nums text-ink-2">${i + 1}/6</span><span class="step-label font-medium text-ink-2 group-hover:text-ink">${s.label}</span></span>
        <span class="step-body block overflow-hidden pl-8 text-sm leading-relaxed text-ink-2">${s.line}<a href="${s.href}" class="mt-2 block whitespace-nowrap font-semibold text-brass hover:underline">ดูรายละเอียด →</a></span>
      </button></li>`).join('')}
    </ol>
    <div class="lg:col-span-8 lg:sticky lg:top-24">
      <div class="tour-stage relative rounded-xl border border-rule bg-surface p-5 shadow-[0_1px_0_#DFE0DC] md:p-7">
        ${STAGES.map((s) => `<div id="panel-${s.key}" class="tour-panel" data-key="${s.key}" role="region" aria-label="${s.label}">${PANELS[s.key]}</div>`).join('')}
      </div>
      <div class="tour-progress mt-4 flex gap-1.5">${STAGES.map((s) => `<span data-key="${s.key}" class="h-1 flex-1 rounded-full bg-rule"></span>`).join('')}</div>
    </div>
  </div>`;
}

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function setStage(tour, key) {
  tour.dataset.active = key;
  tour.querySelectorAll('.tour-step').forEach((b) => b.classList.toggle('is-active', b.dataset.key === key));
  tour.querySelectorAll('.tour-panel').forEach((p) => {
    const on = p.dataset.key === key;
    p.classList.toggle('is-on', on);
    if (on) p.querySelectorAll('.tour-row').forEach((r, i) => { r.style.setProperty('--d', `${i * 60}ms`); r.classList.remove('row-in'); void r.offsetWidth; r.classList.add('row-in'); });
  });
  tour.querySelectorAll('.tour-progress span').forEach((s) => s.classList.toggle('bg-ink', s.dataset.key === key));
  tour.querySelectorAll('.count').forEach(countUp);
}

function initTour(tour, { autoplay }) {
  const keys = STAGES.map((s) => s.key);
  setStage(tour, tour.dataset.active);
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; };
  tour.querySelectorAll('.tour-step').forEach((b) => b.addEventListener('click', () => { stop(); setStage(tour, b.dataset.key); }));
  if (!autoplay || reduce) return;
  // Auto-advance while the tour is on screen; any click hands control to the visitor.
  const run = () => { if (timer) return; timer = setInterval(() => {
    const i = keys.indexOf(tour.dataset.active); setStage(tour, keys[(i + 1) % keys.length]);
  }, 4200); };
  new IntersectionObserver(([e]) => (e.isIntersecting ? run() : stop()), { threshold: 0.4 }).observe(tour);
  tour.addEventListener('pointerenter', stop);
}

function countUp(el) {
  const to = Number(el.dataset.to); if (!to || reduce) return;
  const t0 = performance.now(), dur = 700;
  const fmt = (v) => v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tick = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

function initReveal() {
  if (reduce || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('reveal-armed');
  // Safety net: never leave content hidden if the observer is throttled (background tab, old browser).
  setTimeout(() => document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-in')), 2500);
  const io =new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: 0, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach((el) => (reduce ? el.classList.add('is-in') : io.observe(el)));
}
