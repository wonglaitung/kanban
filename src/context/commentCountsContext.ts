import { createContext } from 'react';

export interface CommentCountsValue {
  counts: Record<string, number>;
  refresh: () => void;
}

export const CommentCountsContext = createContext<CommentCountsValue>({ counts: {}, refresh: () => {} });
