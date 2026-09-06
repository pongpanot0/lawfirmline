import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const IAPP_BASE_URL = 'https://api.iapp.co.th/v3/store/data/thai-legal';

export interface IappDekaSearchResult {
  dekaId: string;
  headnote: string;
  citedStatutes: string[];
  courtLevel: string | null;
  judgmentDate: string | null;
  sourceUrl: string;
}

interface IappDekaRawResult {
  case_id?: string;
  headnote?: string;
  cited_sections?: string[];
  court?: string;
  judgment_date?: string;
}

@Injectable()
export class IappLegalClient {
  private readonly logger = new Logger(IappLegalClient.name);

  constructor(private config: ConfigService) {}

  private getApiKey(): string | undefined {
    return this.config.get<string>('IAPP_API_KEY');
  }

  private normalize(raw: IappDekaRawResult): IappDekaSearchResult {
    const dekaId = raw.case_id ?? '';
    return {
      dekaId,
      headnote: raw.headnote ?? '',
      citedStatutes: raw.cited_sections ?? [],
      courtLevel: raw.court ?? null,
      judgmentDate: raw.judgment_date ?? null,
      sourceUrl: `https://deka.supremecourt.or.th/search?q=${encodeURIComponent(dekaId)}`,
    };
  }

  async searchPrecedents(
    query: string,
    opts?: { citesLaw?: string; citesSection?: string; topK?: number },
  ): Promise<IappDekaSearchResult[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('IAPP_API_KEY not set — skipping precedent search (demo mode)');
      return [];
    }

    const params = new URLSearchParams({ query });
    if (opts?.citesLaw) params.set('cites_law', opts.citesLaw);
    if (opts?.citesSection) params.set('cites_section', opts.citesSection);
    params.set('top_k', String(opts?.topK ?? 5));

    const url = `${IAPP_BASE_URL}/deka/search?${params.toString()}`;
    const res = await fetch(url, { headers: { apikey: apiKey } });

    if (!res.ok) {
      this.logger.error(`iApp deka/search error: ${res.status}`);
      throw new Error('iApp deka/search failed');
    }

    const data = (await res.json()) as { results?: IappDekaRawResult[] };
    return (data.results ?? []).map((r) => this.normalize(r));
  }

  async getPrecedentDetail(dekaId: string): Promise<IappDekaSearchResult | null> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('IAPP_API_KEY not set — skipping precedent detail fetch (demo mode)');
      return null;
    }

    const url = `${IAPP_BASE_URL}/deka/${encodeURIComponent(dekaId)}?include_body=true`;
    const res = await fetch(url, { headers: { apikey: apiKey } });

    if (res.status === 404) return null;
    if (!res.ok) {
      this.logger.error(`iApp deka/{case_id} error: ${res.status}`);
      throw new Error('iApp deka/{case_id} failed');
    }

    const raw = (await res.json()) as IappDekaRawResult;
    return this.normalize(raw);
  }
}
