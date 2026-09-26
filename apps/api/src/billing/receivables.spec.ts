import { agingBucket, daysOverdue, summarizeBuckets } from './receivables';

const d = (s: string) => new Date(s + 'T00:00:00+07:00');

it('not yet due counts as 0 days', () => expect(daysOverdue(d('2026-10-10'), d('2026-09-26'))).toBe(0));
it('counts whole days past due', () => expect(daysOverdue(d('2026-06-24'), d('2026-09-26'))).toBe(94));
it('null due date is 0', () => expect(daysOverdue(null, d('2026-09-26'))).toBe(0));
it.each([[0,'0-30'],[30,'0-30'],[31,'31-60'],[60,'31-60'],[61,'61-90'],[90,'61-90'],[91,'90+']])('bucket %i → %s', (n, b) => expect(agingBucket(n as number)).toBe(b));
it('sums per bucket', () => expect(summarizeBuckets([{outstanding:100,bucket:'0-30'},{outstanding:50,bucket:'0-30'},{outstanding:7,bucket:'90+'}])).toEqual({'0-30':150,'31-60':0,'61-90':0,'90+':7}));
