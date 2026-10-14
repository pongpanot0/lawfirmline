import { fillPlaceholders } from './fill-placeholders';

describe('fillPlaceholders', () => {
  it('fills known keys everywhere', () => {
    expect(fillPlaceholders('{{a}} and {{a}} {{b}}', { a: 'X', b: 'Y' })).toEqual({ text: 'X and X Y', missing: [] });
  });
  it('keeps unknown and empty keys, lists each once', () => {
    expect(fillPlaceholders('{{a}} {{b}} {{b}} {{c}}', { a: '', b: 'ok' })).toEqual({
      text: '{{a}} ok ok {{c}}',
      missing: ['a', 'c'],
    });
  });
  it('does not treat $ in values as a replacement pattern', () => {
    expect(fillPlaceholders('{{a}}', { a: '$& 100' }).text).toBe('$& 100');
  });

  it('never resolves inherited object members like {{constructor}}', () => {
    expect(fillPlaceholders('{{constructor}} {{toString}}', {})).toEqual({ text: '{{constructor}} {{toString}}', missing: ['constructor', 'toString'] });
  });
});
