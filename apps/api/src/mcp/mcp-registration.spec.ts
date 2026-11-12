import { InvalidClientMetadataError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { oauthFixture } from '../../test/mcp-fixtures';

describe('MCP client registration', () => {
  it.each(['https://claude.ai/callback', 'http://localhost:1234/cb', 'http://127.0.0.1/cb', 'http://[::1]:1234/cb'])('allows %s and public clients', async uri => {
    const { provider, prisma } = oauthFixture();
    const client = await provider.clientsStore.registerClient!({ redirect_uris: [uri], client_name: 'Claude', token_endpoint_auth_method: 'none' });
    expect(client.client_id).toBeTruthy();
    expect(client.client_secret).toBeUndefined();
    expect(prisma.mcpClient.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ redirectUris: [uri], clientName: 'Claude' }) }));
  });
  it.each(['http://example.com/cb', 'http://localhost.evil.test/cb', 'javascript:alert(1)', 'file:///tmp/cb', 'https://example.com/cb#fragment', 'https://user:pass@example.com/cb'])('rejects unsafe redirect %s', async uri => {
    const { provider, prisma } = oauthFixture();
    await expect(provider.clientsStore.registerClient!({ redirect_uris: [uri] })).rejects.toThrow(InvalidClientMetadataError);
    expect(prisma.mcpClient.create).not.toHaveBeenCalled();
  });
  it('caps names and redirect lists', async () => {
    const { provider } = oauthFixture();
    await expect(provider.clientsStore.registerClient!({ redirect_uris: ['https://example.com'], client_name: 'x'.repeat(201) })).rejects.toThrow(InvalidClientMetadataError);
    await expect(provider.clientsStore.registerClient!({ redirect_uris: [] })).rejects.toThrow(InvalidClientMetadataError);
  });
});
