import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IappLegalClient } from './iapp-legal.client';

describe('IappLegalClient', () => {
  let client: IappLegalClient;
  const mockConfig = { get: jest.fn() };
  const originalFetch = global.fetch;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockReturnValue('test-api-key');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IappLegalClient,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    client = module.get(IappLegalClient);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('searchPrecedents', () => {
    it('calls deka/search with the query and apikey header, and normalizes results', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              case_id: '1234/2565',
              headnote: 'ตัวอย่างหัวข้อย่อ',
              cited_sections: ['ป.อ. 335'],
              court: 'ศาลฎีกา',
              judgment_date: '2022-05-01',
            },
          ],
        }),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const results = await client.searchPrecedents('ลักทรัพย์ในเวลากลางคืน', {
        citesSection: '335',
        topK: 5,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(String(url)).toContain('https://api.iapp.co.th/v3/store/data/thai-legal/deka/search');
      expect(String(url)).toContain('query=');
      expect(String(url)).toContain('cites_section=335');
      expect(String(url)).toContain('top_k=5');
      expect((init.headers as Record<string, string>).apikey).toBe('test-api-key');

      expect(results).toEqual([
        {
          dekaId: '1234/2565',
          headnote: 'ตัวอย่างหัวข้อย่อ',
          citedStatutes: ['ป.อ. 335'],
          courtLevel: 'ศาลฎีกา',
          judgmentDate: '2022-05-01',
          sourceUrl: 'https://deka.supremecourt.or.th/search?q=1234%2F2565',
        },
      ]);
    });

    it('throws when iApp responds with a non-2xx status', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 }) as unknown as typeof fetch;
      await expect(client.searchPrecedents('คำค้น')).rejects.toThrow('iApp deka/search failed');
    });

    it('throws when no api key is configured, so the caller does not charge credit for an empty result', async () => {
      mockConfig.get.mockReturnValue(undefined);
      await expect(client.searchPrecedents('คำค้น')).rejects.toThrow(
        'IAPP_API_KEY ยังไม่ได้ตั้งค่า ไม่สามารถค้นหาฎีกาได้',
      );
    });
  });

  describe('getPrecedentDetail', () => {
    it('calls deka/{case_id} with include_body and returns a normalized result', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          case_id: '1234/2565',
          headnote: 'หัวข้อย่อฉบับเต็ม',
          cited_sections: ['ป.อ. 335'],
          court: 'ศาลฎีกา',
          judgment_date: '2022-05-01',
        }),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const result = await client.getPrecedentDetail('1234/2565');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(String(url)).toBe(
        'https://api.iapp.co.th/v3/store/data/thai-legal/deka/1234%2F2565?include_body=true',
      );
      expect(result?.dekaId).toBe('1234/2565');
    });

    it('returns null when the ruling is not found (404)', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
      const result = await client.getPrecedentDetail('9999/9999');
      expect(result).toBeNull();
    });
  });
});
