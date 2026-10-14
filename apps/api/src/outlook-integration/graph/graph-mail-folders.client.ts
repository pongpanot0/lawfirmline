import { Injectable } from '@nestjs/common';
import { GraphApiError, GraphHttp } from './graph-http';

interface GraphMailFolder {
  id: string;
  displayName: string;
  childFolderCount: number;
}

export interface MailFolderEntry {
  id: string;
  displayName: string;
  displayPath: string;
  /** Inbox/Sent/Drafts/... — never linkable to a case (would pour the whole mailbox into it). */
  isSystem: boolean;
}

const FOLDER_QUERY = '$top=100&$select=id,displayName,childFolderCount';
const WELL_KNOWN = ['inbox', 'sentitems', 'drafts', 'deleteditems', 'junkemail', 'outbox', 'archive'] as const;
// ponytail: depth cap guards against pathological trees; raise if a firm nests case folders deeper than 6.
const MAX_DEPTH = 6;

@Injectable()
export class GraphMailFoldersClient {
  constructor(private http: GraphHttp) {}

  async listMailFolders(accessToken: string): Promise<MailFolderEntry[]> {
    const systemIds = await this.wellKnownFolderIds(accessToken);
    const out: MailFolderEntry[] = [];
    const walk = async (path: string, parentPath: string, depth: number): Promise<void> => {
      const folders = await this.http.paginate<GraphMailFolder>(accessToken, path);
      for (const folder of folders) {
        const displayPath = parentPath ? `${parentPath}/${folder.displayName}` : folder.displayName;
        out.push({ id: folder.id, displayName: folder.displayName, displayPath, isSystem: systemIds.has(folder.id) });
        if (folder.childFolderCount > 0 && depth < MAX_DEPTH) {
          await walk(`/me/mailFolders/${encodeURIComponent(folder.id)}/childFolders?${FOLDER_QUERY}`, displayPath, depth + 1);
        }
      }
    };
    await walk(`/me/mailFolders?${FOLDER_QUERY}`, '', 0);
    return out;
  }

  /** mailFolder has no wellKnownName in v1.0 — resolve the ids by their well-known aliases (missing ones, e.g. archive, just 404). */
  private async wellKnownFolderIds(accessToken: string): Promise<Set<string>> {
    const ids = await Promise.all(
      WELL_KNOWN.map((name) =>
        this.http
          .request<{ id: string }>(accessToken, `/me/mailFolders/${name}?$select=id`)
          .then((folder) => folder.id)
          .catch((error) => {
            // Only a genuinely absent alias is skippable; anything else must fail closed so a system folder is never linkable.
            if (error instanceof GraphApiError && error.status === 404) return null;
            throw error;
          }),
      ),
    );
    return new Set(ids.filter((id): id is string => !!id));
  }
}
