import { ConfigService } from '@nestjs/config';
import { LineMessagingService } from './line-messaging.service';

describe('LineMessagingService.getMessageContent', () => {
  const makeService = (env: Record<string, string>) =>
    new LineMessagingService({ get: (k: string) => env[k] } as unknown as ConfigService);

  afterEach(() => jest.restoreAllMocks());

  it('downloads content with the channel token', async () => {
    const svc = makeService({ LINE_CHANNEL_ACCESS_TOKEN: 'tok' });
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('img-bytes').buffer,
      headers: { get: () => 'image/jpeg' },
    } as any);
    const result = await svc.getMessageContent('msg-1');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api-data.line.me/v2/bot/message/msg-1/content',
      { headers: { Authorization: 'Bearer tok' } },
    );
    expect(result?.contentType).toBe('image/jpeg');
    expect(result?.buffer.toString()).toBe('img-bytes');
  });

  it('returns null on a non-OK response', async () => {
    const svc = makeService({ LINE_CHANNEL_ACCESS_TOKEN: 'tok' });
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false, status: 404 } as any);
    expect(await svc.getMessageContent('msg-1')).toBeNull();
  });

  it('returns null without calling fetch when no token is configured', async () => {
    const svc = makeService({});
    const fetchSpy = jest.spyOn(global, 'fetch' as any);
    expect(await svc.getMessageContent('msg-1')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
