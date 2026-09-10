import { ConfigService } from '@nestjs/config';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { FileStorageService } from './file-storage.service';

describe('FileStorageService local paths', () => {
  let directory: string;
  let service: FileStorageService;

  beforeEach(() => {
    directory = path.join(tmpdir(), `fs-storage-${Date.now()}`);
    mkdirSync(directory, { recursive: true });
    service = new FileStorageService({
      get: (key: string) => (key === 'UPLOAD_DIR' ? directory : undefined),
    } as ConfigService);
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('put returns a relative key and getBuffer reads it back', async () => {
    const key = await service.put('intake/a/documents/f.txt', Buffer.from('hello'), 'text/plain');
    expect(key).toBe('intake/a/documents/f.txt');
    expect(path.isAbsolute(key)).toBe(false);

    const buf = await service.getBuffer(key);
    expect(buf.toString()).toBe('hello');
  });

  it('reads legacy DB values stored as uploads/... without doubling the prefix', async () => {
    const legacyService = new FileStorageService({
      get: (key: string) => (key === 'UPLOAD_DIR' ? './uploads' : undefined),
    } as ConfigService);

    // Same path shape older put() wrote into the DB.
    expect(legacyService.resolveLocalPath('uploads/intake/a/doc.txt')).toBe(
      path.join('./uploads', 'intake/a/doc.txt'),
    );
    expect(legacyService.resolveLocalPath('intake/a/doc.txt')).toBe(
      path.join('./uploads', 'intake/a/doc.txt'),
    );

    const absolute = path.join(directory, 'intake', 'a', 'doc.txt');
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, 'legacy');

    const buf = await service.getBuffer('uploads/intake/a/doc.txt');
    expect(buf.toString()).toBe('legacy');
  });

  it('does not resolve uploads/uploads/... for a relative key', () => {
    const resolved = service.resolveLocalPath('intake/x/file.pdf');
    expect(resolved).toBe(path.join(directory, 'intake/x/file.pdf'));
    expect(resolved.split(`${path.sep}uploads${path.sep}`).length - 1).toBeLessThan(2);
  });
});
