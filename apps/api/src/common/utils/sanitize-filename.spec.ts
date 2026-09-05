import { buildContentDispositionHeader } from './sanitize-filename';

describe('buildContentDispositionHeader', () => {
  it('passes a normal filename through cleanly in the ASCII fallback', () => {
    const header = buildContentDispositionHeader('contract-final.pdf');
    expect(header).toContain('filename="contract-final.pdf"');
  });

  it('preserves Thai characters via the RFC 5987 filename* parameter', () => {
    const header = buildContentDispositionHeader('สัญญาเช่า.pdf');
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent('สัญญาเช่า.pdf')}`);
  });

  it('strips double quotes from the ASCII fallback', () => {
    const header = buildContentDispositionHeader('evil".pdf');
    expect(header).toContain('filename="evil_.pdf"');
  });

  it('strips backslashes from the ASCII fallback', () => {
    const header = buildContentDispositionHeader('evil\\.pdf');
    expect(header).toContain('filename="evil_.pdf"');
  });

  it('strips semicolons from the ASCII fallback to prevent header parameter injection', () => {
    const header = buildContentDispositionHeader('evil;filename=spoofed.exe');
    expect(header).toContain('filename="evil_filename=spoofed.exe"');
    expect(header.split(';').length).toBe(3);
  });

  it('strips CR and LF characters from the ASCII fallback', () => {
    const header = buildContentDispositionHeader('evil\r\nSet-Cookie: x=1.pdf');
    expect(header).toContain('filename="evil__Set-Cookie: x=1.pdf"');
  });

  it('falls back to a default name when the ASCII-safe result would be empty', () => {
    const header = buildContentDispositionHeader('');
    expect(header).toContain('filename="download"');
  });
});
