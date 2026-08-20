import { useContext } from 'react';
import { CommentCountsContext, type CommentCountsValue } from '../context/commentCountsContext';

export function useCommentCounts(): CommentCountsValue {
  return useContext(CommentCountsContext);
}
