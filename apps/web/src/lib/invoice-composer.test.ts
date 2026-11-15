import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { addWork, reorder, groupLines, buildInvoiceLines, type ComposerLine } from './invoice-composer.ts';
const time: ComposerLine = { key: 't', id: 't', source: 'time', description: 'time', amount: 100, taxClass: 'LITIGATION_EXEMPT' };
const expense: ComposerLine = { key: 'e', id: 'e', source: 'expense', description: 'expense', amount: 30, taxClass: 'DISBURSEMENT' };
const manual: ComposerLine = { key: 'm', source: 'manual', description: 'manual', amount: 50, taxClass: 'ADVISORY_VAT' };
test('add work once and reorder', () => { assert.deepEqual(addWork([time], [time, expense]), [time, expense]); assert.deepEqual(reorder([time, expense], 1, 0), [expense, time]); });
test('split groups and preserve displayed order in payload', () => { const lines = [expense, manual, time]; assert.deepEqual(groupLines(lines), { fees: [manual, time], disbursements: [expense] }); assert.deepEqual(buildInvoiceLines(lines), { milestoneLines: [], lineItems: [{ description: 'manual', quantity: 1, unitPrice: 50, taxClass: 'ADVISORY_VAT', sortOrder: 0 }], timeEntryLines: [{ id: 't', description: 'time', taxClass: 'LITIGATION_EXEMPT', sortOrder: 1 }], expenseLines: [{ id: 'e', description: 'expense', taxClass: 'DISBURSEMENT', sortOrder: 2 }] }); });

test('shared totals apply discount to fees and VAT only', async () => {
  const { computeInvoiceTotals } = await import('../../../../packages/shared/src/invoice-totals.ts');
  assert.deepEqual(computeInvoiceTotals([time, expense, manual], 30, true, 0.07), { exempt: 100, taxable: 50, disbursement: 30, vat: 2.8, total: 152.8 });
  assert.equal(computeInvoiceTotals([time, expense, manual], 30, false, 0.07).vat, 0);
});

test('milestone payload keeps edited description and order', () => { assert.deepEqual(buildInvoiceLines([{ key: 'milestone:x', id: 'x', source: 'milestone', description: ' งวดแรก ', amount: 10, taxClass: 'ADVISORY_VAT' }]).milestoneLines, [{ id: 'x', description: 'งวดแรก', sortOrder: 0 }]); });
