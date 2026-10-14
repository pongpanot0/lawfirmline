import { GraphMailFoldersClient } from './graph-mail-folders.client';
import { GraphApiError, GraphHttp } from './graph-http';

describe('GraphMailFoldersClient', () => {
  const http = { paginate: jest.fn(), request: jest.fn() };
  const client = new GraphMailFoldersClient(http as unknown as GraphHttp);

  beforeEach(() => jest.clearAllMocks());

  it('walks child folders depth-first and flags well-known folders as system', async () => {
    http.request.mockImplementation((_token: string, path: string) =>
      path.startsWith('/me/mailFolders/inbox?')
        ? Promise.resolve({ id: 'inbox-id' })
        : Promise.reject(new GraphApiError(404, 'not found')),
    );
    http.paginate.mockImplementation((_token: string, path: string) => {
      if (path.startsWith('/me/mailFolders?')) {
        return Promise.resolve([
          { id: 'inbox-id', displayName: 'Inbox', childFolderCount: 1 },
          { id: 'arch', displayName: 'Archive 2024', childFolderCount: 0 },
        ]);
      }
      if (path.startsWith('/me/mailFolders/inbox-id/childFolders?')) {
        return Promise.resolve([{ id: 'c1', displayName: 'TSBREF20250001 ABC', childFolderCount: 0 }]);
      }
      return Promise.resolve([]);
    });

    const folders = await client.listMailFolders('token');

    expect(http.paginate).toHaveBeenCalledWith('token', '/me/mailFolders?$top=100&$select=id,displayName,childFolderCount');
    expect(http.paginate).toHaveBeenCalledWith(
      'token',
      '/me/mailFolders/inbox-id/childFolders?$top=100&$select=id,displayName,childFolderCount',
    );
    expect(folders).toEqual([
      { id: 'inbox-id', displayName: 'Inbox', displayPath: 'Inbox', isSystem: true },
      { id: 'c1', displayName: 'TSBREF20250001 ABC', displayPath: 'Inbox/TSBREF20250001 ABC', isSystem: false },
      { id: 'arch', displayName: 'Archive 2024', displayPath: 'Archive 2024', isSystem: false },
    ]);
  });

  it('fails closed when an alias lookup fails for any reason other than 404', async () => {
    http.request.mockRejectedValue(new GraphApiError(503, 'unavailable'));
    await expect(client.listMailFolders('token')).rejects.toBeInstanceOf(GraphApiError);
  });
});
