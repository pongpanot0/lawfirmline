import { useEffect, useState } from 'react';
import { api } from './api';
import { leaveFlagsForDate, LeaveFlag } from './leave-flags';

/**
 * Who is flagged as on/asking for leave on `date`, for an assignee picker.
 * A load failure is silent — the flag is a courtesy warning, not something
 * that should block opening the dialog.
 */
export function useLeaveFlags(token: string | null, date: string | null): Map<string, LeaveFlag> {
  const [flags, setFlags] = useState<Map<string, LeaveFlag>>(new Map());

  useEffect(() => {
    if (!token || !date) {
      setFlags(new Map());
      return;
    }
    let active = true;
    api
      .getLeaves(token, date, date)
      .then((leaves) => {
        if (active) setFlags(leaveFlagsForDate(leaves, date));
      })
      .catch(() => {
        if (active) setFlags(new Map());
      });
    return () => {
      active = false;
    };
  }, [token, date]);

  return flags;
}
