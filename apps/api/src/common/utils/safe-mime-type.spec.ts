import { safeMimeType } from './safe-mime-type';

describe('safeMimeType', () => {
  it('passes through a common, allowlisted type', () => {
    expect(safeMimeType('application/pdf')).toBe('application/pdf');
  });

  it('passes through common office document types', () => {
    expect(safeMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('passes through common image types', () => {
    expect(safeMimeType('image/png')).toBe('image/png');
    expect(safeMimeType('image/jpeg')).toBe('image/jpeg');
  });

  it('falls back to application/octet-stream for an unrecognized or dangerous type', () => {
    expect(safeMimeType('text/html')).toBe('application/octet-stream');
    expect(safeMimeType('application/javascript')).toBe('application/octet-stream');
  });

  it('falls back to application/octet-stream for an empty or malformed value', () => {
    expect(safeMimeType('')).toBe('application/octet-stream');
    expect(safeMimeType('not a mime type')).toBe('application/octet-stream');
  });
});
