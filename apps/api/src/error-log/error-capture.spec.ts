import { BadRequestException, InternalServerErrorException, PayloadTooLargeException } from '@nestjs/common';
import { ErrorCaptureFilter, ErrorCaptureLogger } from './error-capture';

const errors = { record: jest.fn() };

function httpHost(user?: { id: string; firmId: string }) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const req = { method: 'POST', originalUrl: '/cases/1?x=1', headers: { 'user-agent': 'jest' }, user };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getArgByIndex: (i: number) => [req, res][i],
    getArgs: () => [req, res],
  };
  return { host: host as any, res };
}

describe('ErrorCaptureFilter', () => {
  const adapter = { reply: jest.fn(), isHeadersSent: () => false, end: jest.fn() };
  const filter = new ErrorCaptureFilter({ httpAdapter: adapter } as any, errors as any);

  beforeEach(() => jest.clearAllMocks());

  it('records a 5xx with its request and user', () => {
    filter.catch(new InternalServerErrorException('boom'), httpHost({ id: 'u1', firmId: 'f1' }).host);
    expect(errors.record).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'api', message: 'boom', statusCode: 500, method: 'POST', path: '/cases/1', userId: 'u1', firmId: 'f1', userAgent: 'jest' }),
    );
    expect(adapter.reply).toHaveBeenCalled();
  });

  it('records an unknown error as 500', () => {
    filter.catch(new TypeError('x is undefined'), httpHost().host);
    expect(errors.record).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500, context: 'TypeError' }));
  });

  it('ignores 4xx', () => {
    filter.catch(new BadRequestException('bad'), httpHost().host);
    expect(errors.record).not.toHaveBeenCalled();
  });

  it('keeps the Thai 413 message', () => {
    const { host, res } = httpHost();
    filter.catch(new PayloadTooLargeException(), host);
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'ไฟล์มีขนาดใหญ่เกินที่กำหนด' }));
    expect(errors.record).not.toHaveBeenCalled();
  });
});

describe('ErrorCaptureLogger', () => {
  const logger = new ErrorCaptureLogger(errors as any);
  beforeAll(() => logger.setLogLevels([]));
  beforeEach(() => jest.clearAllMocks());

  it('reads (message, stack, context)', () => {
    logger.error('mail failed', 'Error: at x', 'MailService');
    expect(errors.record).toHaveBeenCalledWith({ source: 'server', message: 'mail failed', stack: 'Error: at x', context: 'MailService' });
  });

  it('reads (message, context)', () => {
    logger.error('cron failed', 'DigestCron');
    expect(errors.record).toHaveBeenCalledWith(expect.objectContaining({ message: 'cron failed', stack: null, context: 'DigestCron' }));
  });

  it('skips what the filter already recorded', () => {
    logger.error('boom', 'stack', 'ExceptionsHandler');
    expect(errors.record).not.toHaveBeenCalled();
  });
});
