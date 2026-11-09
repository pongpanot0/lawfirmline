import { externalParty, internalMatcher } from './email-intake.service';
import { subjectRefs } from './case-email.service';

const msg = (fromAddress: string, toAddresses: string[] = [], ccAddresses: string[] = []) =>
  ({ fromName: fromAddress.split('@')[0], fromAddress, toAddresses, ccAddresses, bodyText: '' });

describe('externalParty', () => {
  const isInternal = internalMatcher(new Set(['suchanya@siambarristers.com', 'me@gmail.com']));

  it('treats anyone on the firm domain as staff, not only members', () => {
    expect(isInternal('Weerayuth@SiamBarristers.com')).toBe(true);
    expect(isInternal('someone@gmail.com')).toBe(false); // a public domain is not the firm's
  });

  it('skips a staff forward and picks the outside recipient', () => {
    const party = externalParty([msg('weerayuth@siambarristers.com', ['jirayadas@dhipaya.co.th'], ['suchanya@siambarristers.com'])], isInternal);
    expect(party).toEqual({ address: 'jirayadas@dhipaya.co.th', name: null, message: null });
  });

  it('prefers the newest outside sender', () => {
    const outside = msg('jirayadas@dhipaya.co.th');
    expect(externalParty([msg('weerayuth@siambarristers.com'), outside], isInternal)?.message).toBe(outside);
  });

  it('is null when only staff took part', () => {
    expect(externalParty([msg('weerayuth@siambarristers.com', ['suchanya@siambarristers.com'])], isInternal)).toBeNull();
  });
});

describe('subjectRefs', () => {
  it('pulls policy and claim numbers, not dates or words', () => {
    expect(subjectRefs('Fw: [อีเมล 1/2] : Insured : พญ.พาริชา /Policy no. 14030-108-250070146 / Claim no. PFI-26-C-F9434 - 08/09/2569'))
      .toEqual(['14030-108-250070146', 'PFI-26-C-F9434']);
    expect(subjectRefs('Re: ขอเอกสารเพิ่มเติม')).toEqual([]);
    expect(subjectRefs(null)).toEqual([]);
  });
});
