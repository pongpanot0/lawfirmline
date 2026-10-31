import { BadRequestException } from '@nestjs/common';
import { GraphDriveClient, safeDriveName, SMALL_UPLOAD_MAX_BYTES, UPLOAD_CHUNK_BYTES } from './graph-drive.client';
import { GraphApiError, GraphHttp } from './graph-http';

describe('GraphDriveClient', () => {
  const http = { request: jest.fn(), requestBuffer: jest.fn(), putBuffer: jest.fn(), paginate: jest.fn() };
  const client = new GraphDriveClient(http as unknown as GraphHttp);
  const realFetch = global.fetch;

  afterEach(() => {
    jest.resetAllMocks();
    global.fetch = realFetch;
  });

  it('lists children of my OneDrive root and of an item in another drive', async () => {
    http.paginate.mockResolvedValue([]);
    await client.listChildren('tok', 'me', 'root');
    await client.listChildren('tok', 'b!drv', '01ITEM');
    expect(http.paginate.mock.calls[0][1]).toMatch(/^\/me\/drive\/root\/children\?\$top=200&\$select=/);
    expect(http.paginate.mock.calls[1][1]).toMatch(/^\/drives\/b!drv\/items\/01ITEM\/children\?/);
  });

  it.each(['../me', 'a/b', '01%2F', ''])('rejects id %p that could change the Graph path', async (bad) => {
    await expect(client.getItem('tok', 'b!drv', bad)).rejects.toBeInstanceOf(BadRequestException);
    await expect(client.listChildren('tok', bad, 'root')).rejects.toBeInstanceOf(BadRequestException);
    expect(http.request).not.toHaveBeenCalled();
    expect(http.paginate).not.toHaveBeenCalled();
  });

  it('creates a folder under the chosen parent, renaming on conflict, with a cleaned name', async () => {
    http.request.mockResolvedValue({ id: 'NEWF', folder: {} });
    await expect(client.createFolder('tok', 'b!drv', 'PARENT', 'TSB-1: คำฟ้อง/1')).resolves.toEqual({ id: 'NEWF', folder: {} });
    expect(http.request).toHaveBeenCalledWith('tok', '/drives/b!drv/items/PARENT/children', {
      method: 'POST',
      body: JSON.stringify({ name: 'TSB-1_ คำฟ้อง_1', folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }),
    });
  });

  it('downloads content through requestBuffer', async () => {
    http.requestBuffer.mockResolvedValue(Buffer.from('pdf'));
    await expect(client.downloadContent('tok', 'b!drv', 'IT')).resolves.toEqual(Buffer.from('pdf'));
    expect(http.requestBuffer).toHaveBeenCalledWith('tok', '/drives/b!drv/items/IT/content');
  });

  it('uploads a small file by name with conflictBehavior=rename and a cleaned name', async () => {
    http.putBuffer.mockResolvedValue({ id: 'NEW' });
    const body = Buffer.from('x');
    await client.upload('tok', 'b!drv', 'PARENT', 'คำฟ้อง: ฉบับ/1.docx', body, 'application/octet-stream');
    expect(http.putBuffer).toHaveBeenCalledWith(
      'tok',
      `/drives/b!drv/items/PARENT:/${encodeURIComponent('คำฟ้อง_ ฉบับ_1.docx')}:/content?@microsoft.graph.conflictBehavior=rename`,
      body,
      'application/octet-stream',
    );
  });

  it('uses an upload session in 320 KiB-aligned chunks above 4 MB, without the bearer token', async () => {
    http.request.mockResolvedValue({ uploadUrl: 'https://upload.example/session' });
    const size = SMALL_UPLOAD_MAX_BYTES + 1;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 202, json: async () => ({ nextExpectedRanges: [] }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: 'BIG', webUrl: 'https://w' }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const item = await client.upload('tok', 'b!drv', 'PARENT', 'big.pdf', Buffer.alloc(size), 'application/pdf');

    expect(item.id).toBe('BIG');
    expect(UPLOAD_CHUNK_BYTES % (320 * 1024)).toBe(0);
    expect(http.request).toHaveBeenCalledWith('tok', '/drives/b!drv/items/PARENT:/big.pdf:/createUploadSession', {
      method: 'POST',
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = fetchMock.mock.calls[0][1];
    expect(first.method).toBe('PUT');
    expect(first.headers['Content-Range']).toBe(`bytes 0-${UPLOAD_CHUNK_BYTES - 1}/${size}`);
    expect(first.headers.Authorization).toBeUndefined();
    expect(fetchMock.mock.calls[1][1].headers['Content-Range']).toBe(`bytes ${UPLOAD_CHUNK_BYTES}-${size - 1}/${size}`);
  });

  it('throws GraphApiError when a chunk is rejected', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 416, text: async () => 'bad range' }) as unknown as typeof fetch;
    await expect(client.uploadChunks('https://upload.example/s', Buffer.alloc(10))).rejects.toMatchObject({ status: 416 });
  });

  it('replaces an existing item in place (small) and via an item upload session (large)', async () => {
    http.putBuffer.mockResolvedValue({ id: 'IT' });
    await client.replaceContent('tok', 'b!drv', 'IT', Buffer.from('v2'), 'application/octet-stream');
    expect(http.putBuffer).toHaveBeenCalledWith('tok', '/drives/b!drv/items/IT/content', Buffer.from('v2'), 'application/octet-stream');

    http.request.mockResolvedValue({ uploadUrl: 'https://upload.example/s2' });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'IT' }) }) as unknown as typeof fetch;
    await client.replaceContent('tok', 'b!drv', 'IT', Buffer.alloc(SMALL_UPLOAD_MAX_BYTES + 1), 'application/octet-stream');
    expect(http.request).toHaveBeenCalledWith('tok', '/drives/b!drv/items/IT/createUploadSession', { method: 'POST', body: '{}' });
  });

  it('creates missing folders for Samnuan/{ownRef} and reuses existing ones', async () => {
    http.request
      .mockResolvedValueOnce({ id: 'SAMNUAN' }) // GET /me/drive/root:/Samnuan → exists
      .mockRejectedValueOnce(new GraphApiError(404, 'not found')) // GET …/SAMNUAN:/2569_0012 → missing
      .mockResolvedValueOnce({ id: 'CASE', parentReference: { driveId: 'b!me' } }); // POST children

    const folder = await client.ensureFolderPath('tok', ['Samnuan', '2569/0012']);

    expect(folder.id).toBe('CASE');
    expect(http.request.mock.calls[0][1]).toBe('/me/drive/root:/Samnuan');
    expect(http.request.mock.calls[1][1]).toBe('/me/drive/items/SAMNUAN:/2569_0012');
    expect(http.request.mock.calls[2]).toEqual([
      'tok',
      '/me/drive/items/SAMNUAN/children',
      { method: 'POST', body: JSON.stringify({ name: '2569_0012', folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }) },
    ]);
  });

  it('re-reads the folder when a parallel request created it first (409)', async () => {
    http.request
      .mockRejectedValueOnce(new GraphApiError(404, 'nf'))
      .mockRejectedValueOnce(new GraphApiError(409, 'exists'))
      .mockResolvedValueOnce({ id: 'SAMNUAN' });
    await expect(client.ensureFolderPath('tok', ['Samnuan'])).resolves.toEqual({ id: 'SAMNUAN' });
  });

  it('returns only document libraries of a site and rejects odd site ids', async () => {
    http.request.mockResolvedValue({
      value: [
        { id: 'b!lib', name: 'Documents', driveType: 'documentLibrary', webUrl: 'w' },
        { id: 'b!x', name: 'Preservation Hold', driveType: 'business', webUrl: 'w' },
      ],
    });
    const drives = await client.listSiteDrives('tok', 'contoso.sharepoint.com,1111,2222');
    expect(drives.map((d) => d.id)).toEqual(['b!lib']);
    expect(http.request.mock.calls[0][1]).toBe('/sites/contoso.sharepoint.com,1111,2222/drives?$select=id,name,driveType,webUrl');
    await expect(client.listSiteDrives('tok', 'a/../b')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('searches sites with an encoded query', async () => {
    http.request.mockResolvedValue({ value: [] });
    await client.searchSites('tok', 'คดี แพ่ง');
    expect(http.request.mock.calls[0][1]).toBe(`/sites?search=${encodeURIComponent('คดี แพ่ง')}&$select=id,displayName,webUrl`);
  });
});

describe('safeDriveName', () => {
  it.each([
    ['2569/0012', '2569_0012'],
    ['A:B*C?"D<E>F|G\\H', 'A_B_C__D_E_F_G_H'],
    ['  .hidden. ', 'hidden'],
    ['...', 'untitled'],
    ['สัญญา.docx', 'สัญญา.docx'],
  ])('%p → %p', (input, expected) => {
    expect(safeDriveName(input)).toBe(expected);
  });
});
