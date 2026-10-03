import { useEffect, useRef, useState } from 'react';
import { loadTaskDraft, removeTaskDraft, saveTaskDraft, TaskDraftData, TaskDraftMeta } from '@/api/drafts';

/** Scoped local drafts are restored once; nothing is submitted to the API automatically. */
export function useTaskDraft<T extends TaskDraftData>(key: string | null, data: T, restore: (value: T) => void, dirty: boolean, meta: TaskDraftMeta) {
  const restoreRef = useRef(restore); restoreRef.current = restore;
  const suspended = useRef(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const ready = !key || loadedKey === key;
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [retry, setRetry] = useState(0);
  const revision = useRef(0);
  const text = JSON.stringify(data);
  useEffect(() => {
    let active = true; suspended.current = false; setLoadedKey(null); setMessage(''); setError(''); setWarning('');
    if (key) loadTaskDraft<T>(key).then(row => {
      if (!active) return;
      if (row) {
        restoreRef.current(row.data);
        setMessage('กู้คืนร่างที่ยังไม่ได้บันทึกแล้ว');
        if (row.missingFiles.length) setWarning(`ต้องแนบไฟล์ใหม่: ${row.missingFiles.join(', ')}`);
      }
      setLoadedKey(key);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'โหลดร่างไม่ได้'); });
    return () => { active = false; revision.current++; };
  }, [key, retry]);
  useEffect(() => {
    if (!key || !ready || suspended.current) return;
    const current = ++revision.current;
    setError('');
    const write = dirty ? saveTaskDraft(key, JSON.parse(text) as T, meta) : removeTaskDraft(key);
    void write.then(() => {
      if (current === revision.current && dirty) setMessage('เก็บร่างในเครื่องนี้แล้ว · กลับมาทำต่อได้');
    }).catch(e => { if (current === revision.current) setError(`ยังเก็บร่างไม่ได้ · ${e instanceof Error ? e.message : 'ลองอีกครั้งก่อนปิดแอป'}`); });
  }, [key, ready, text, dirty, meta.name, meta.route]);
  return {
    resume: () => { suspended.current = false; },
    ready, message, error, warning, retry: () => {
      if (!ready) { setRetry(value => value + 1); return; }
      if (!key) return;
      // A failed save must retry the current text, never restore an older stored draft over it.
      const write = dirty ? saveTaskDraft(key, data, meta) : removeTaskDraft(key);
      void write.then(() => { setError(''); if (dirty) setMessage('เก็บร่างในเครื่องนี้แล้ว · กลับมาทำต่อได้'); })
        .catch(e => setError(`ยังเก็บร่างไม่ได้ · ${e instanceof Error ? e.message : 'ลองอีกครั้ง'}`));
    },
    persist: (value: T = data) => key ? saveTaskDraft(key, value, meta) : Promise.resolve(),
    clear: async () => { suspended.current = true; if (key) await removeTaskDraft(key); },
  };
}
