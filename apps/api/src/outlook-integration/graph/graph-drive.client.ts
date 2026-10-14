import { BadRequestException, Injectable } from '@nestjs/common';
import { GraphApiError, GraphHttp } from './graph-http';

export interface DriveItem {
  id: string;
  name: string;
  size?: number;
  webUrl: string;
  lastModifiedDateTime: string;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
  parentReference?: { driveId?: string; id?: string; path?: string };
  lastModifiedBy?: { user?: { displayName?: string } };
  /** Set on "shared with me" entries: the real item, living in someone else's drive. */
  remoteItem?: DriveItem;
}

export interface GraphSite {
  id: string;
  displayName: string;
  webUrl: string;
}

export interface GraphDrive {
  id: string;
  name: string;
  driveType: string;
  webUrl: string;
}

/** Graph's simple PUT upload takes at most 4 MB; anything bigger needs an upload session. */
export const SMALL_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
/** Upload-session chunks must be multiples of 320 KiB (Graph rule); 10 × 320 KiB ≈ 3.1 MB per PUT. */
export const UPLOAD_CHUNK_BYTES = 10 * 320 * 1024;

const ITEM_SELECT = 'id,name,size,webUrl,lastModifiedDateTime,file,folder,parentReference,lastModifiedBy';
const GRAPH_ID = /^[A-Za-z0-9!_-]+$/;
const SITE_ID = /^[A-Za-z0-9.,-]+$/;

/** Ids come from the browser; Graph's own id alphabet only, so a value can never add or climb path segments. */
function graphId(id: string): string {
  if (!GRAPH_ID.test(id)) throw new BadRequestException('รหัส OneDrive ไม่ถูกต้อง');
  return id;
}

function driveBase(driveId: string): string {
  return driveId === 'me' ? '/me/drive' : `/drives/${graphId(driveId)}`;
}

function itemPath(driveId: string, itemId: string): string {
  return itemId === 'root' ? `${driveBase(driveId)}/root` : `${driveBase(driveId)}/items/${graphId(itemId)}`;
}

/** OneDrive rejects `" * : < > ? / \ |` and leading/trailing spaces or dots in a name. */
export function safeDriveName(name: string): string {
  const cleaned = name
    .replace(/["*:<>?/\\|]/g, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 200);
  return cleaned || 'untitled';
}

/**
 * The OneDrive/SharePoint calls ส่วน D needs, on top of GraphHttp (auth header, 429/503 retry,
 * paging). Every call runs with a delegated token, so it sees exactly what that user sees.
 */
@Injectable()
export class GraphDriveClient {
  constructor(private readonly http: GraphHttp) {}

  async listChildren(token: string, driveId: string, itemId: string): Promise<DriveItem[]> {
    return this.http.paginate<DriveItem>(token, `${itemPath(driveId, itemId)}/children?$top=200&$select=${ITEM_SELECT}`);
  }

  async getItem(token: string, driveId: string, itemId: string): Promise<DriveItem> {
    return this.http.request<DriveItem>(token, `${itemPath(driveId, itemId)}?$select=${ITEM_SELECT}`);
  }

  async sharedWithMe(token: string): Promise<DriveItem[]> {
    return this.http.paginate<DriveItem>(token, '/me/drive/sharedWithMe');
  }

  async searchSites(token: string, query: string): Promise<GraphSite[]> {
    const res = await this.http.request<{ value: GraphSite[] }>(
      token,
      `/sites?search=${encodeURIComponent(query)}&$select=id,displayName,webUrl`,
    );
    return res.value;
  }

  async listSiteDrives(token: string, siteId: string): Promise<GraphDrive[]> {
    if (!SITE_ID.test(siteId) || siteId.includes('..')) throw new BadRequestException('รหัส SharePoint site ไม่ถูกต้อง');
    const res = await this.http.request<{ value: GraphDrive[] }>(token, `/sites/${siteId}/drives?$select=id,name,driveType,webUrl`);
    return res.value.filter((drive) => drive.driveType === 'documentLibrary');
  }

  async downloadContent(token: string, driveId: string, itemId: string): Promise<Buffer> {
    return this.http.requestBuffer(token, `${itemPath(driveId, itemId)}/content`);
  }

  /** New file ≤ 4 MB. A name clash gets renamed by OneDrive ("x 1.docx") instead of overwriting someone's file. */
  async uploadSmall(token: string, driveId: string, parentId: string, name: string, body: Buffer, contentType: string): Promise<DriveItem> {
    return this.http.putBuffer<DriveItem>(
      token,
      `${itemPath(driveId, parentId)}:/${encodeURIComponent(safeDriveName(name))}:/content?@microsoft.graph.conflictBehavior=rename`,
      body,
      contentType,
    );
  }

  /** `{ parentId, name }` = new file (renamed on clash); `{ itemId }` = overwrite that item's content. */
  async createUploadSession(
    token: string,
    driveId: string,
    target: { parentId: string; name: string } | { itemId: string },
  ): Promise<string> {
    const isReplace = 'itemId' in target;
    const path = isReplace
      ? `${itemPath(driveId, target.itemId)}/createUploadSession`
      : `${itemPath(driveId, target.parentId)}:/${encodeURIComponent(safeDriveName(target.name))}:/createUploadSession`;
    const body = isReplace ? {} : { item: { '@microsoft.graph.conflictBehavior': 'rename' } };
    const res = await this.http.request<{ uploadUrl: string }>(token, path, { method: 'POST', body: JSON.stringify(body) });
    return res.uploadUrl;
  }

  /**
   * PUTs `body` to a pre-authenticated upload URL in 320 KiB-aligned chunks. Deliberately raw `fetch`
   * without the Authorization header: Graph documents that sending it to the upload URL can 401.
   */
  async uploadChunks(uploadUrl: string, body: Buffer): Promise<DriveItem> {
    let result: DriveItem | null = null;
    for (let start = 0; start < body.length; start += UPLOAD_CHUNK_BYTES) {
      const end = Math.min(start + UPLOAD_CHUNK_BYTES, body.length) - 1;
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${start}-${end}/${body.length}` },
        body: new Uint8Array(body.subarray(start, end + 1)),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new GraphApiError(res.status, `Upload chunk ${start}-${end} failed: ${res.status} ${text.slice(0, 300)}`);
      }
      if (res.status === 200 || res.status === 201) result = (await res.json()) as DriveItem;
    }
    if (!result) throw new GraphApiError(500, 'Upload session finished without returning the file');
    return result;
  }

  /** New file in a folder: simple PUT up to 4 MB, upload session above that. */
  async upload(token: string, driveId: string, parentId: string, name: string, body: Buffer, contentType: string): Promise<DriveItem> {
    if (body.length <= SMALL_UPLOAD_MAX_BYTES) return this.uploadSmall(token, driveId, parentId, name, body, contentType);
    return this.uploadChunks(await this.createUploadSession(token, driveId, { parentId, name }), body);
  }

  /** Overwrite an existing file — same item id, so the Office-online link keeps working. */
  async deleteItem(token: string, driveId: string, itemId: string): Promise<void> {
    await this.http.request(token, itemPath(driveId, itemId), { method: 'DELETE' });
  }

  async replaceContent(token: string, driveId: string, itemId: string, body: Buffer, contentType: string): Promise<DriveItem> {
    if (body.length <= SMALL_UPLOAD_MAX_BYTES) {
      return this.http.putBuffer<DriveItem>(token, `${itemPath(driveId, itemId)}/content`, body, contentType);
    }
    return this.uploadChunks(await this.createUploadSession(token, driveId, { itemId }), body);
  }

  /** "Specific people" view link (never anonymous): only the listed recipients can open it. */
  async createSharingLink(token: string, driveId: string, itemId: string, recipients: string[]): Promise<{ webUrl: string }> {
    const res = await this.http.request<{ link: { webUrl: string } }>(token, `${itemPath(driveId, itemId)}/createLink`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'view',
        scope: 'users',
        recipients: recipients.map((email) => ({ email })),
        retainInheritedPermissions: false,
      }),
    });
    return { webUrl: res.link.webUrl };
  }

  /** `['Samnuan', ownRef]` → `/me/drive/root:/Samnuan/{ownRef}`, creating each missing level. */
  async ensureFolderPath(token: string, segments: string[]): Promise<DriveItem> {
    let parentId = 'root';
    let folder: DriveItem | null = null;
    for (const segment of segments) {
      folder = await this.getOrCreateFolder(token, parentId, safeDriveName(segment));
      parentId = folder.id;
    }
    if (!folder) throw new BadRequestException('ไม่ได้ระบุ folder');
    return folder;
  }

  private async getOrCreateFolder(token: string, parentId: string, name: string): Promise<DriveItem> {
    const childPath = `${itemPath('me', parentId)}:/${encodeURIComponent(name)}`;
    try {
      return await this.http.request<DriveItem>(token, childPath);
    } catch (error) {
      if (!(error instanceof GraphApiError) || error.status !== 404) throw error;
    }
    try {
      return await this.http.request<DriveItem>(token, `${itemPath('me', parentId)}/children`, {
        method: 'POST',
        body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      });
    } catch (error) {
      // Another request created it between our GET and POST.
      if (error instanceof GraphApiError && error.status === 409) return this.http.request<DriveItem>(token, childPath);
      throw error;
    }
  }
}
