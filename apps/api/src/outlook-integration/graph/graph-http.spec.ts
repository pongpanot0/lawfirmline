import { GraphApiError, GraphHttp, GRAPH_BASE } from './graph-http';

function res(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    arrayBuffer: async () => new TextEncoder().encode(String(body)).buffer,
  };
}

describe('GraphHttp', () => {
  const http = new GraphHttp();
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
    jest.spyOn(GraphHttp.prototype as any, 'sleep').mockResolvedValue(undefined);
  });

  it('prefixes relative paths and sends the bearer token', async () => {
    fetchMock.mockResolvedValue(res(200, { ok: 1 }));
    await expect(http.request('tok', '/me')).resolves.toEqual({ ok: 1 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${GRAPH_BASE}/me`);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('retries 429 honoring Retry-After, then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(res(429, 'slow down', { 'retry-after': '2' }))
      .mockResolvedValueOnce(res(200, { ok: 2 }));
    await expect(http.request('tok', '/me')).resolves.toEqual({ ok: 2 });
    expect((GraphHttp.prototype as any).sleep).toHaveBeenCalledWith(2000);
  });

  it('gives up after 3 retries with GraphApiError carrying the status', async () => {
    fetchMock.mockResolvedValue(res(503, 'down'));
    await expect(http.request('tok', '/me')).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not retry a 404', async () => {
    fetchMock.mockResolvedValue(res(404, 'nope'));
    await expect(http.request('tok', '/me/events/x')).rejects.toBeInstanceOf(GraphApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns undefined on 204', async () => {
    fetchMock.mockResolvedValue(res(204, ''));
    await expect(http.request('tok', '/me/events/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('paginate follows @odata.nextLink', async () => {
    fetchMock
      .mockResolvedValueOnce(res(200, { value: [1, 2], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next' }))
      .mockResolvedValueOnce(res(200, { value: [3] }));
    await expect(http.paginate<number>('tok', '/me/mailFolders')).resolves.toEqual([1, 2, 3]);
    expect(fetchMock.mock.calls[1][0]).toBe('https://graph.microsoft.com/v1.0/next');
  });

  it('requestBuffer returns the body bytes', async () => {
    fetchMock.mockResolvedValue(res(200, 'abc'));
    const buf = await http.requestBuffer('tok', '/me/drive/items/1/content');
    expect(buf.toString()).toBe('abc');
  });
});
