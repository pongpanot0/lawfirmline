import { decodeUploadFilename } from './decode-upload-filename';

describe('decodeUploadFilename', () => {
  it('restores a UTF-8 filename that Multer mis-decoded as latin1', () => {
    const mojibake = Buffer.from('สัญญา.pdf', 'utf8').toString('latin1');
    expect(decodeUploadFilename(mojibake)).toBe('สัญญา.pdf');
  });

  it('leaves a plain ASCII filename unchanged', () => {
    expect(decodeUploadFilename('contract.pdf')).toBe('contract.pdf');
  });

  it('leaves a genuine latin1 filename unchanged when it is not valid UTF-8', () => {
    const genuineLatin1 = 'café.pdf';
    expect(decodeUploadFilename(genuineLatin1)).toBe(genuineLatin1);
  });

  it('returns an empty string unchanged', () => {
    expect(decodeUploadFilename('')).toBe('');
  });
});
