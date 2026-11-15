import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { localePath, alternates } from './i18n.ts';

test('locale paths preserve pages and convert both roots', () => {
  assert.equal(localePath('en', '/'), '/en');
  assert.equal(localePath('th', '/en'), '/');
  assert.equal(localePath('en', '/pricing'), '/en/pricing');
  assert.equal(localePath('th', '/en/pricing'), '/pricing');
  assert.equal(localePath('en', '/en/pricing'), '/en/pricing');
  assert.equal(localePath('en', '/#features'), '/en#features');
  assert.equal(localePath('th', '/en#features'), '/#features');
});

test('alternates retain the requested canonical and pair both languages', () => {
  assert.deepEqual(alternates('/en/pricing'), {
    canonical: '/en/pricing',
    languages: { th: '/pricing', en: '/en/pricing', 'x-default': '/pricing' },
  });
});

test('English feature copy is complete and contains no Thai script', async () => {
  const { stages, getStages, getPage } = await import('./features.ts');
  const enStages = getStages('en');
  assert.equal(enStages.length, stages.length);
  for (const stage of enStages) {
    assert.ok(stage.label && stage.line);
    const page = getPage('en', stage.key);
    assert.ok(page.h1 && page.lead && page.details.length === 3 && page.faq.length >= 2);
    assert.doesNotMatch(JSON.stringify({ stage, page }), /[\u0e00-\u0e7f]/);
    assert.doesNotMatch(JSON.stringify({ stage, page }), /\b(?:ISO|bank-grade|15 minutes|automatic invoicing)\b/i);
  }
});

test('shared marketing copy has matching keys and English contains no Thai except case numbers', async () => {
  const { readFileSync } = await import('node:fs');
  for (const name of [
    'MarketingNav',
    'MarketingFooter',
    'CtaBand',
    'CaseTour',
    'CourtFeeEstimator',
    'AppPanels',
    'MarketingHome',
  ]) {
    const source = readFileSync(new URL(`../../components/marketing/${name}.tsx`, import.meta.url), 'utf8');
    const match = source.match(/const copy = (\{[\s\S]*?\});/);
    assert.ok(match, `${name} copy object missing`);
    // Plain object literal (prettier strips JSON quoting), so evaluate it rather than JSON.parse.
    const copy = new Function(`return ${match[1]}`)();
    assert.deepEqual(Object.keys(copy.en).sort(), Object.keys(copy.th).sort(), name);
    assert.doesNotMatch(JSON.stringify(copy.en).replace(/(?:ผบ\.|พ\.)\s+\d+\/\d+/g, ''), /[\u0e00-\u0e7f]/, name);
    assert.doesNotMatch(JSON.stringify(copy.en), /\b(?:ISO|bank-grade|15 minutes|automatic invoicing)\b/i, name);
  }
});

test('alternates pair both canonical versions of each marketing path', () => {
  for (const path of ['/', '/pricing', '/features/x']) {
    const en = localePath('en', path);
    for (const canonical of [path, en]) {
      assert.deepEqual(alternates(canonical), { canonical, languages: { th: path, en, 'x-default': path } });
    }
  }
});

test('sitemap pairs contain absolute Thai and English URLs on both entries', async () => {
  const { sitemapPair } = await import('./sitemap-pairs.ts');
  for (const path of ['/', '/pricing', '/features/x']) {
    const languages = { th: `https://example.com${path}`, en: `https://example.com${localePath('en', path)}` };
    const entries = sitemapPair('https://example.com', path, new Date('2026-01-01'), 0.8);
    assert.deepEqual(
      entries.map((entry) => entry.url),
      [languages.th, languages.en],
    );
    for (const entry of entries) assert.deepEqual(entry.alternates, { languages });
  }
});
