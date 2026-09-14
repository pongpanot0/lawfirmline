import { api } from './api';
import type { CourtDayResponse, CourtDayState } from './court-day';
const DB = 'samnuan-court-offline';
export function openCourtOffline(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('packs', { keyPath: 'key' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
export async function clearCourtOffline() {
  try { localStorage.removeItem('samnuan:offline-identity'); const db = await openCourtOffline(); const tx = db.transaction('packs', 'readwrite'); tx.objectStore('packs').clear(); tx.oncomplete = () => db.close(); } catch { /* Logout must still finish when storage is disabled. */ }
}
export async function prepareCourtOffline(token: string, identity: { id: string; firmId: string }, data: CourtDayResponse, state: CourtDayState, locale: string) {
  const registration = await navigator.serviceWorker.register('/offline-court/sw.js', { scope: '/offline-court/' });
  if (!registration.active) await new Promise<void>((resolve, reject) => { const worker = registration.installing ?? registration.waiting; if (!worker) return reject(new Error('Offline worker unavailable')); const timer = setTimeout(() => reject(new Error('Offline installation timed out')), 15000); worker.addEventListener('statechange', () => { if (worker.state === 'activated') { clearTimeout(timer); resolve(); } else if (worker.state === 'redundant') { clearTimeout(timer); reject(new Error('Offline installation failed')); } }); });
  const documents = await api.getDocuments(token, data.event.caseId);
  const files: { id: string; version: number; filename: string; blob: Blob; hash: string }[] = [];
  let total = 0;
  for (const pin of state.documents) {
    const blob = await api.downloadDocument(token, data.event.caseId, pin.id, pin.version);
    total += blob.size;
    if (total > 50 * 1024 * 1024) throw new Error('แฟ้มออฟไลน์รองรับรวม 50 MB / Offline pack limit is 50 MB');
    const bytes = await blob.arrayBuffer(); const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    const doc = documents.find(d => d.id === pin.id);
    files.push({ id: pin.id, version: pin.version, filename: doc?.versions?.find(v => v.version === pin.version)?.filename ?? doc?.filename ?? 'document', blob, hash });
  }
  const key = `${identity.firmId}:${identity.id}:${data.event.id}`;
  const db = await openCourtOffline();
  try {
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('packs', 'readwrite'); const store = tx.objectStore('packs'); const read = store.get(key); read.onsuccess = () => { if (read.result?.status && read.result.status !== 'synced') { tx.abort(); return; } store.put({ key, identity, data, state, locale, files, expiresAt: Date.now() + 86400000, savedAt: Date.now(), status: 'synced', apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001' }); }; tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(new Error('มีร่างออฟไลน์ที่ยังไม่ส่ง เปิดแฟ้มออฟไลน์เพื่อจัดการก่อน / Resolve the existing offline draft first')); });
    localStorage.setItem('samnuan:offline-identity', JSON.stringify(identity));
  } finally { db.close(); }
  return `/offline-court/index.html?pack=${encodeURIComponent(key)}`;
}
