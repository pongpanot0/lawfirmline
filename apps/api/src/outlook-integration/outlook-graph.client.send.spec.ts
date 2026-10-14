import { Test } from '@nestjs/testing';
import { OutlookGraphClient } from './outlook-graph.client';
import { GraphHttp } from './graph/graph-http';

describe('OutlookGraphClient — sending mail', () => {
  let client: OutlookGraphClient;
  const fetchMock = jest.fn();
  const realFetch = global.fetch;
  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const draft = {
    id: 'AAMk-draft',
    conversationId: 'conv-1',
    internetMessageId: '<draft-1@firm.test>',
    subject: '[TSB-1] นัดประชุม',
    bodyPreview: null,
    receivedDateTime: '2026-10-13T03:00:00Z',
    hasAttachments: false,
  };

  beforeEach(async () => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    const module = await Test.createTestingModule({ providers: [OutlookGraphClient, GraphHttp] }).compile();
    client = module.get(OutlookGraphClient);
  });

  afterAll(() => {
    global.fetch = realFetch;
  });

  it('creates a draft in /me/messages with an immutable id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, draft));

    const result = await client.createDraftMessage('token-1', {
      subject: '[TSB-1] นัดประชุม',
      body: { contentType: 'HTML', content: '<div>สวัสดี</div>' },
      toRecipients: [{ emailAddress: { address: 'client@example.com' } }],
    });

    expect(result.id).toBe('AAMk-draft');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/messages');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Prefer')).toBe('IdType="ImmutableId"');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-1');
    expect(JSON.parse(init.body)).toEqual({
      subject: '[TSB-1] นัดประชุม',
      body: { contentType: 'HTML', content: '<div>สวัสดี</div>' },
      toRecipients: [{ emailAddress: { address: 'client@example.com' } }],
    });
  });

  it('uses createReply or createReplyAll on the source message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, draft)).mockResolvedValueOnce(jsonResponse(201, draft));

    await client.createReplyDraft('token-1', 'src/id+1', false);
    await client.createReplyDraft('token-1', 'src/id+1', true);

    expect(fetchMock.mock.calls[0][0]).toBe('https://graph.microsoft.com/v1.0/me/messages/src%2Fid%2B1/createReply');
    expect(fetchMock.mock.calls[1][0]).toBe('https://graph.microsoft.com/v1.0/me/messages/src%2Fid%2B1/createReplyAll');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Prefer')).toBe('IdType="ImmutableId"');
  });

  it('patches a draft', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, draft));

    await client.updateDraft('token-1', 'AAMk-draft', { subject: 'Re: เรื่องเดิม' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/messages/AAMk-draft');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ subject: 'Re: เรื่องเดิม' });
  });

  it('adds a fileAttachment with base64 content', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 'att-1' }));

    await client.addFileAttachment('token-1', 'AAMk-draft', {
      name: 'สัญญา.pdf',
      contentType: 'application/pdf',
      contentBytes: Buffer.from('pdf').toString('base64'),
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/messages/AAMk-draft/attachments');
    expect(JSON.parse(init.body)).toEqual({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: 'สัญญา.pdf',
      contentType: 'application/pdf',
      contentBytes: 'cGRm',
    });
  });

  it('sends a draft and resolves on 202 with an empty body', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));

    await expect(client.sendDraft('token-1', 'AAMk-draft')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe('https://graph.microsoft.com/v1.0/me/messages/AAMk-draft/send');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('syncs with immutable ids on delta and attachment reads', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { value: [] }))
      .mockResolvedValueOnce(jsonResponse(200, { value: [] }));

    await client.getFolderDelta('token-1', 'inbox');
    await client.getAttachments('token-1', 'AAMk-1');

    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Prefer')).toBe(
      'outlook.body-content-type="html", IdType="ImmutableId"',
    );
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('Prefer')).toBe('IdType="ImmutableId"');
  });
});
