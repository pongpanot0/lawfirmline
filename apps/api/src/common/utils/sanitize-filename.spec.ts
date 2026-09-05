import { sanitizeFilenameForHeader } from './sanitize-filename';

describe('sanitizeFilenameForHeader', () => {
  it('leaves a normal filename unchanged', () => {
    expect(sanitizeFilenameForHeader('contract-final.pdf')).toBe('contract-final.pdf');
  });

  it('leaves Thai characters unchanged', () => {
    expect(sanitizeFilenameForHeader('สัญญาเช่า.pdf')).toBe('สัญญาเช่า.pdf');
  });

  it('strips double quotes', () => {
    expect(sanitizeFilenameForHeader('evil".pdf')).toBe('evil.pdf');
  });

  it('strips CR and LF characters', () => {
    expect(sanitizeFilenameForHeader('evil\r\nSet-Cookie: x=1.pdf')).toBe('evilSet-Cookie: x=1.pdf');
  });

  it('falls back to a default name when the result would be empty', () => {
    expect(sanitizeFilenameForHeader('"""')).toBe('download');
  });
});
