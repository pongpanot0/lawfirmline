import * as JSZip from 'jszip';
import { buildDocx } from './docx-builder';

describe('buildDocx', () => {
  it('returns a valid .docx (zip) buffer containing the title and body lines', async () => {
    const buffer = await buildDocx('ทดสอบ', 'บรรทัด1\nบรรทัด2');

    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    expect(buffer.length).toBeGreaterThan(1000);

    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file('word/document.xml')!.async('string');
    expect(documentXml).toContain('ทดสอบ');
    expect(documentXml).toContain('บรรทัด1');
    expect(documentXml).toContain('บรรทัด2');
  });
});
