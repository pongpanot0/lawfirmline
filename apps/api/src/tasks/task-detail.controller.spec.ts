import { Test } from '@nestjs/testing';
import { Readable } from 'stream';
import { TaskDetailController } from './task-detail.controller';
import { TaskDetailService } from './task-detail.service';
import { FileStorageService } from '../common/services/file-storage.service';

describe('TaskDetailController download', () => {
  it('streams with nosniff, safe mime and attachment disposition', async () => {
    const detail = {
      getAttachmentForDownload: jest.fn().mockResolvedValue({
        storagePath: 'tasks/t1/a.pdf',
        filename: 'สัญญา.pdf',
        mimeType: 'application/pdf',
      }),
    };
    const storage = { openDownloadStream: jest.fn().mockResolvedValue(Readable.from(['x'])) };
    const module = await Test.createTestingModule({
      controllers: [TaskDetailController],
      providers: [
        { provide: TaskDetailService, useValue: detail },
        { provide: FileStorageService, useValue: storage },
      ],
    }).compile();
    const controller = module.get(TaskDetailController);
    const res = { setHeader: jest.fn(), on: jest.fn(), once: jest.fn(), emit: jest.fn(), write: jest.fn(), end: jest.fn() } as any;
    await controller.download({ id: 'u1' } as any, 't1', 'a1', res);
    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader.mock.calls.find((c: string[]) => c[0] === 'Content-Disposition')?.[1]).toContain('attachment');
  });

  it('destroys the response instead of throwing when the stream errors', async () => {
    const detail = {
      getAttachmentForDownload: jest.fn().mockResolvedValue({
        storagePath: 'tasks/t1/gone.pdf',
        filename: 'gone.pdf',
        mimeType: 'application/pdf',
      }),
    };
    const stream = new Readable({ read() {} });
    const storage = { openDownloadStream: jest.fn().mockResolvedValue(stream) };
    const module = await Test.createTestingModule({
      controllers: [TaskDetailController],
      providers: [
        { provide: TaskDetailService, useValue: detail },
        { provide: FileStorageService, useValue: storage },
      ],
    }).compile();
    const controller = module.get(TaskDetailController);
    const res = {
      setHeader: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
    } as any;

    await controller.download({ id: 'u1' } as any, 't1', 'a1', res);
    expect(stream.listenerCount('error')).toBeGreaterThan(0);

    const boom = new Error('object gone');
    stream.emit('error', boom);
    expect(res.destroy).toHaveBeenCalledWith(boom);
  });
});
