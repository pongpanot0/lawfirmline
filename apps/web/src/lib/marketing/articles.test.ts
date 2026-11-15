import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PLAN_CONFIG, SubscriptionPlan } from '@lawfirm/shared';
import { fillPlaceholders, getArticles, parseFrontmatter, parseInline, parseMarkdown } from './articles.ts';

describe('articles', () => {
  it('parses simple frontmatter', () => {
    const parsed = parseFrontmatter(
      '---\nslug: example\ntitle: "A title"\ntags: ["one", "two"]\nlegal_review_required: true\nreviewed: 2026-11-15\n---\nBody',
    );
    assert.deepEqual(parsed.fields, {
      slug: 'example',
      title: 'A title',
      tags: ['one', 'two'],
      legal_review_required: true,
      reviewed: '2026-11-15',
    });
    assert.equal(parsed.body, 'Body');
  });
  it('excludes articles awaiting legal review', () => {
    const dir = mkdtempSync(join(tmpdir(), 'articles-'));
    try {
      const source = '---\nslug: example\ntitle: "Title"\nmeta_description: "Description"\nreviewed: 2026-11-15\n';
      writeFileSync(join(dir, 'published.md'), `${source}---\nBody`);
      writeFileSync(join(dir, 'review.md'), `${source}legal_review_required: true\n---\nBody`);
      assert.equal(getArticles(dir).length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('fills plan values and rejects unknown placeholders', () => {
    assert.equal(
      fillPlaceholders('{{price:TEAM}} / {{users:TEAM}}'),
      `${PLAN_CONFIG[SubscriptionPlan.TEAM].priceThb.toLocaleString('th-TH')} / ${PLAN_CONFIG[SubscriptionPlan.TEAM].maxUsers.toLocaleString('th-TH')}`,
    );
    assert.throws(() => fillPlaceholders('{{price:UNKNOWN}}'));
    assert.throws(() => fillPlaceholders('{{other:TEAM}}'));
  });
  it('parses a table and inline formatting', () => {
    assert.deepEqual(parseMarkdown('| A | B |\n|---|---|\n| one | two |'), [
      { type: 'table', header: ['A', 'B'], rows: [['one', 'two']] },
    ]);
    assert.deepEqual(parseInline('a **bold** [link](/pricing)'), [
      { type: 'text', text: 'a ' },
      { type: 'bold', text: 'bold' },
      { type: 'text', text: ' ' },
      { type: 'link', text: 'link', href: '/pricing' },
    ]);
    assert.throws(() => parseInline('[bad](javascript:alert)'));
    assert.throws(() => parseInline('[bad](//example.com)'));
  });
  it('loads the published articles with resolved content', () => {
    const articles = getArticles();
    assert.equal(articles.length, 2);
    for (const article of articles) {
      assert.ok(article.title && article.meta_description && article.slug);
      assert.ok(!article.body.includes('{{'));
    }
  });
});
