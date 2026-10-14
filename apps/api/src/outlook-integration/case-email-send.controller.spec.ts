import { GUARDS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CaseEmailSendController } from './case-email-send.controller';
import { SendCaseEmailDto } from './dto/send-case-email.dto';

describe('CaseEmailSendController', () => {
  it('requires login and access to the case for every route', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CaseEmailSendController)).toEqual([JwtAuthGuard, CaseAccessGuard]);
  });
});

describe('SendCaseEmailDto', () => {
  const ok = { to: ['client@example.com'], subject: 'เรื่อง', body: 'เนื้อหา' };
  const failedFields = async (body: object) =>
    (await validate(plainToInstance(SendCaseEmailDto, body))).map((error) => error.property);

  it('accepts a minimal valid payload', async () => {
    expect(await failedFields(ok)).toEqual([]);
  });

  it('rejects a malformed To or CC address', async () => {
    expect(await failedFields({ ...ok, to: ['not-an-email'] })).toContain('to');
    expect(await failedFields({ ...ok, cc: ['x@'] })).toContain('cc');
  });

  it('rejects an empty To list and more than 50 To addresses', async () => {
    expect(await failedFields({ ...ok, to: [] })).toContain('to');
    expect(await failedFields({ ...ok, to: Array.from({ length: 51 }, (_, i) => `p${i}@x.com`) })).toContain('to');
  });

  it('requires subject and body', async () => {
    expect(await failedFields({ ...ok, subject: '', body: '' })).toEqual(expect.arrayContaining(['subject', 'body']));
  });

  it('rejects non-uuid document ids and more than 10 attachments', async () => {
    expect(await failedFields({ ...ok, documentIds: ['../../etc/passwd'] })).toContain('documentIds');
    const eleven = Array.from({ length: 11 }, () => '6f1c3c9e-1d2b-4c1a-9a51-0e0c3b6a7f10');
    expect(await failedFields({ ...ok, documentIds: eleven })).toContain('documentIds');
  });
});
