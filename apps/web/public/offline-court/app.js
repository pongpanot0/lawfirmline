'use strict';
(async () => {
  const el = id => document.getElementById(id);
  const key = new URLSearchParams(location.search).get('pack');
  let pack, database, saving = Promise.resolve(), editing = false;
  const open = () => new Promise((resolve, reject) => { const r = indexedDB.open('samnuan-court-offline', 1); r.onupgradeneeded = () => r.result.createObjectStore('packs', { keyPath: 'key' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const get = () => new Promise((resolve, reject) => { const r = database.transaction('packs').objectStore('packs').get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const write = () => { const snapshot = structuredClone(pack); saving = saving.catch(() => {}).then(() => new Promise((resolve, reject) => { const tx = database.transaction('packs', 'readwrite'); tx.objectStore('packs').put(snapshot); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); })); return saving; };
  const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  function canonical(v) { if (Array.isArray(v)) return v.map(canonical); if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])); return v; }
  try {
    database = await open(); pack = await get();
    const identity = JSON.parse(localStorage.getItem('samnuan:offline-identity') || 'null');
    if (!pack || !identity || identity.id !== pack.identity.id || identity.firmId !== pack.identity.firmId || Date.now() > pack.expiresAt) throw new Error('แฟ้มหมดอายุหรือออกจากระบบแล้ว กรุณาเตรียมแฟ้มใหม่ขณะออนไลน์ / Pack expired or signed out. Prepare it again online.');
    const th = pack.locale === 'th'; document.documentElement.lang = th ? 'th' : 'en';
    const text = (id, a, b) => el(id).textContent = th ? a : b;
    el('title').textContent = pack.data.event.title; el('meta').textContent = `${pack.data.event.case.ownRef} · ${new Date(pack.data.event.startAt).toLocaleString(th ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok' })}`;
    text('hint','แฟ้มนี้อยู่ในอุปกรณ์นี้และหมดอายุใน 24 ชั่วโมง บันทึกระหว่างไม่มีเน็ตได้ กลับออนไลน์แล้วกดส่งร่าง จากนั้นตรวจและยืนยันผลในระบบหลัก','This device holds this pack for 24 hours. Save without internet, sync when connected, then review and complete in the main app.');
    text('check-title','รายการเตรียมศาล','Preparation checklist'); text('file-title','ไฟล์ที่เก็บในอุปกรณ์','Files saved on this device'); text('notes-label','บันทึกเตรียมศาล','Preparation notes'); text('outcome-label','ผลนัด / สิ่งที่เกิดขึ้น','Hearing outcome');
    text('save','บันทึกในเครื่อง','Save on device'); text('sync','ส่งร่างเข้าระบบ','Sync draft'); text('back','เปิดระบบหลักเพื่อตรวจผล','Review in the main app');
    text('recover-title','จัดการร่างที่ยังไม่ส่ง','Recover an unsynced draft'); text('recover-hint','หากข้อมูลในระบบเปลี่ยน ร่างนี้จะไม่ทับของคนอื่น ส่งออกสำเนาหรือเปิดระบบหลักเพื่อตรวจความต่างก่อน','If the server changed, this draft cannot overwrite it. Export a copy or review the current record in the main app.'); text('export','ส่งออกสำเนาร่าง','Export draft copy'); text('discard','ลบแฟ้มออกจากเครื่อง','Remove this device copy');
    el('back').href = `/court-day/${pack.data.event.id}`;
    function status() { const words = { synced: ['เก็บในเครื่องแล้ว · ตรงกับฉบับที่เตรียมไว้','Saved on device · matches prepared revision'], queued: ['ร่างในเครื่อง · รอส่งเข้าระบบ','Local draft · waiting to sync'], syncing: ['กำลังส่งร่าง…','Syncing draft…'], failed: ['ส่งไม่สำเร็จ · ร่างยังอยู่ในเครื่อง','Sync failed · draft retained on device'], conflict: ['ข้อมูลในระบบเปลี่ยน · ต้องตรวจความต่าง','Server record changed · review required'] }; el('status').textContent = (navigator.onLine ? (th ? 'ออนไลน์ · ' : 'Online · ') : (th ? 'ออฟไลน์ · ' : 'Offline · ')) + (words[pack.status] || words.queued)[th ? 0 : 1]; }
    async function saveDraft() { if (editing) return; pack.state.notes = el('notes').value; pack.state.outcome = el('outcome').value; pack.status = 'queued'; pack.savedAt = Date.now(); try { await write(); status(); el('saved').textContent = (th ? 'บันทึกในเครื่องเมื่อ ' : 'Saved on device at ') + new Date(pack.savedAt).toLocaleTimeString(); } catch(e) { el('error').textContent = th ? 'บันทึกไม่ได้ พื้นที่อาจเต็ม กรุณาส่งออกสำเนา' : 'Could not save. Storage may be full; export a copy.'; } }
    el('notes').value = pack.state.notes; el('outcome').value = pack.state.outcome;
    for (const item of pack.state.checklist) { const label = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = item.done; checkbox.onchange = () => { item.done = checkbox.checked; saveDraft(); }; label.append(checkbox, document.createTextNode(item.title)); el('checklist').append(label); }
    function download(blob, name) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    for (const file of pack.files) { const b = document.createElement('button'); b.textContent = `${file.filename || file.id} · v${file.version}`; b.onclick = async () => { const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.blob.arrayBuffer())), n => n.toString(16).padStart(2, '0')).join(''); if (hash !== file.hash) { el('error').textContent = th ? 'ไฟล์ไม่สมบูรณ์ กรุณาเตรียมใหม่ออนไลน์' : 'File integrity check failed; prepare again online.'; return; } download(file.blob, file.filename || `court-document-v${file.version}`); }; el('files').append(b); }
    if (!pack.files.length) text('files','ไม่มีไฟล์ที่เลือกไว้ในแฟ้มนี้','No files were selected for this pack.');
    el('save').onclick = saveDraft; el('notes').oninput = saveDraft; el('outcome').oninput = saveDraft;
    el('export').onclick = () => download(new Blob([JSON.stringify({ appointment: pack.data.event.title, version: pack.data.workspace.version, state: { ...pack.state, notes: el('notes').value, outcome: el('outcome').value } }, null, 2)], { type: 'application/json' }), 'court-day-draft.json');
    el('discard').onclick = async () => { if (!confirm(th ? 'ลบแฟ้มและร่างในเครื่องนี้? ข้อมูลที่ยังไม่ส่งจะหาย' : 'Remove this pack and local draft? Unsynced changes will be lost.')) return; await saving; const tx = database.transaction('packs', 'readwrite'); tx.objectStore('packs').delete(key); tx.oncomplete = () => { el('content').hidden = true; text('status','ลบแฟ้มในเครื่องแล้ว','Device copy removed'); }; };
    el('sync').onclick = async () => {
      if (editing) return; await saving; editing = true; el('sync').disabled = true; el('save').disabled = true; el('notes').disabled = true; el('outcome').disabled = true; document.querySelectorAll('input[type=checkbox]').forEach(i => i.disabled = true); el('error').textContent = '';
      try {
        if (Date.now() > pack.expiresAt) throw new Error(th ? 'แฟ้มหมดอายุ กรุณาส่งออกสำเนาและเตรียมใหม่' : 'Pack expired. Export your draft and prepare again.');
        const token = localStorage.getItem('lawfirm_access_token');
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        const api = async (path, options) => { const r = await fetch(pack.apiUrl + path, { ...options, headers, cache: 'no-store' }); if (!r.ok) { const e = new Error((await r.json().catch(() => ({}))).message || `HTTP ${r.status}`); e.status = r.status; throw e; } return r.json(); };
        const me = await api('/auth/me'); if (me.id !== pack.identity.id || me.firmId !== pack.identity.firmId) throw new Error(th ? 'กรุณาเข้าระบบด้วยบัญชีที่เตรียมแฟ้มนี้' : 'Sign in with the account that prepared this pack.');
        pack.status = 'syncing'; status();
        const current = await api(`/calendar/events/${pack.data.event.id}/court-day`);
        if (current.workspace.completedAt) { pack.status = 'conflict'; throw new Error(th ? 'นัดนี้บันทึกผลแล้ว กรุณาตรวจในระบบหลัก' : 'This hearing was completed. Review in the main app.'); }
        if (same(current.workspace.state, pack.state)) { pack.data = current; }
        else {
          if (current.workspace.version !== pack.data.workspace.version) { pack.status = 'conflict'; throw new Error(th ? 'มีคนแก้ข้อมูลแล้ว ร่างนี้ยังอยู่ในเครื่อง' : 'Someone changed this record. Your draft is retained.'); }
          const updated = await api(`/calendar/events/${pack.data.event.id}/court-day`, { method: 'PATCH', body: JSON.stringify({ version: current.workspace.version, state: pack.state }) }); pack.data = { ...current, workspace: updated };
        }
        pack.status = 'synced'; await write();
      } catch(e) { if (pack.status !== 'conflict') pack.status = e.status === 409 ? 'conflict' : 'failed'; await write().catch(() => {}); el('error').textContent = String(e.message); }
      finally { editing = false; status(); el('sync').disabled = false; el('save').disabled = false; el('notes').disabled = false; el('outcome').disabled = false; document.querySelectorAll('input[type=checkbox]').forEach(i => i.disabled = false); }
    };
    window.addEventListener('online', status); window.addEventListener('offline', status);
    window.addEventListener('storage', event => { if (event.key === 'samnuan:offline-identity' && !event.newValue) location.reload(); });
    status(); el('content').hidden = false;
  } catch(e) { el('error').textContent = String(e.message); el('status').textContent = 'เปิดแฟ้มไม่ได้ / Cannot open pack'; }
})();
