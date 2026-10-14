'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, Folder } from 'lucide-react';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { useAuth } from '@/lib/auth';
import { api, ApiError, DriveLibraryItem, DrivePickerItem, DriveSiteItem } from '@/lib/api';

type Source = 'me' | 'shared' | 'sites';

const SOURCES: Array<{ value: Source; label: string }> = [
  { value: 'me', label: 'OneDrive ของฉัน' },
  { value: 'shared', label: 'แชร์กับฉัน' },
  { value: 'sites', label: 'SharePoint' },
];

/** เลือก folder ด้วยบัญชี Microsoft ของผู้ใช้เอง: OneDrive ของฉัน / แชร์กับฉัน / document library ของ SharePoint site. */
export function DriveFolderPicker({
  open,
  title,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onPick: (folder: DrivePickerItem) => Promise<void> | void;
}) {
  const { token } = useAuth();
  const [source, setSource] = useState<Source>('me');
  // Folders opened so far; empty = top level of the source.
  const [path, setPath] = useState<DrivePickerItem[]>([]);
  const [folders, setFolders] = useState<DrivePickerItem[]>([]);
  const [siteQuery, setSiteQuery] = useState('');
  const [sites, setSites] = useState<DriveSiteItem[]>([]);
  const [libraries, setLibraries] = useState<DriveLibraryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');

  const current = path[path.length - 1];

  useEffect(() => {
    if (!token || !open) return;
    let request: Promise<DrivePickerItem[]> | null = null;
    if (current) request = api.getDriveChildren(token, current.driveId, current.id);
    else if (source === 'me') request = api.getDriveChildren(token);
    else if (source === 'shared') request = api.getDriveShared(token);
    if (!request) {
      setFolders([]);
      return;
    }
    setLoading(true);
    setError('');
    request
      .then(setFolders)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'โหลด folder ไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [token, open, source, current?.driveId, current?.id]);

  const switchSource = (next: Source) => {
    setSource(next);
    setPath([]);
    setSites([]);
    setLibraries(null);
  };

  const searchSites = async () => {
    if (!token || siteQuery.trim().length < 2) return;
    setLoading(true);
    setError('');
    try {
      setSites(await api.searchDriveSites(token, siteQuery.trim()));
      setLibraries(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ค้นหา site ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const openSite = async (site: DriveSiteItem) => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      setLibraries(await api.getSiteLibraries(token, site.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'โหลด document library ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const pick = async (folder: DrivePickerItem) => {
    setPicking(true);
    setError('');
    try {
      await onPick(folder);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ผูก folder ไม่สำเร็จ');
    } finally {
      setPicking(false);
    }
  };

  const showSiteSearch = source === 'sites' && path.length === 0;

  return (
    <SideDrawer open={open} title={title} onClose={onClose}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {SOURCES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => switchSource(s.value)}
            className={`min-h-9 rounded-lg px-3 py-1 text-xs ${
              source === s.value ? 'bg-primary text-primary-foreground' : 'border bg-card text-muted-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {path.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1 text-xs">
          <button type="button" className="text-primary hover:underline" onClick={() => setPath([])}>
            {SOURCES.find((s) => s.value === source)?.label}
          </button>
          {path.map((crumb, index) => (
            <span key={`${crumb.driveId}:${crumb.id}`} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <button type="button" className="text-primary hover:underline" onClick={() => setPath(path.slice(0, index + 1))}>
                {crumb.name}
              </button>
            </span>
          ))}
          <button
            type="button"
            disabled={picking}
            onClick={() => current && pick(current)}
            className="ml-auto rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            เลือก folder นี้
          </button>
        </div>
      )}

      {showSiteSearch && (
        <div className="mb-3 space-y-2">
          <div className="flex gap-2">
            <input
              value={siteQuery}
              onChange={(e) => setSiteQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchSites()}
              placeholder="ค้นหา SharePoint site (อย่างน้อย 2 ตัวอักษร)"
              className="min-h-9 flex-1 rounded-lg border bg-background px-3 text-sm"
            />
            <button type="button" onClick={searchSites} className="rounded-lg border px-3 text-sm hover:bg-accent">
              ค้นหา
            </button>
          </div>
          {!libraries &&
            sites.map((site) => (
              <button
                key={site.id}
                type="button"
                onClick={() => openSite(site)}
                className="block w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent"
              >
                {site.displayName}
              </button>
            ))}
          {libraries?.map((library) => (
            <button
              key={library.id}
              type="button"
              onClick={() => setPath([{ id: 'root', driveId: library.id, name: library.name, webUrl: library.webUrl }])}
              className="block w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent"
            >
              {library.name}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}

      {!loading && !showSiteSearch && (
        <div className="space-y-1.5">
          {folders.length === 0 && <p className="text-sm text-muted-foreground">ไม่มี folder ย่อย</p>}
          {folders.map((folder) => (
            <div key={`${folder.driveId}:${folder.id}`} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <button type="button" onClick={() => setPath([...path, folder])} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{folder.name}</span>
              </button>
              <button
                type="button"
                disabled={picking}
                onClick={() => pick(folder)}
                className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
              >
                เลือก
              </button>
            </div>
          ))}
        </div>
      )}
    </SideDrawer>
  );
}
