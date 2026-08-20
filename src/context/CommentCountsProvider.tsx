import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { CommentCountsContext } from './commentCountsContext';
import { getCommentCounts } from '../services/api';

export function CommentCountsProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  const refresh = useCallback(() => {
    getCommentCounts()
      .then(setCounts)
      .catch(() => setCounts({}));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <CommentCountsContext.Provider value={{ counts, refresh }}>{children}</CommentCountsContext.Provider>;
}
