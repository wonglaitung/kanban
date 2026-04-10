import { useState, useEffect, useCallback } from 'react';
import type { Column } from '../types';
import { getColumns, createColumn, updateColumn, deleteColumn as deleteColumnApi } from '../services/api';

export function useColumns() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchColumns = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getColumns();
      setColumns(data);
      setError(null);
    } catch (err) {
      setError('获取列数据失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchColumns();
  }, [fetchColumns]);

  const addColumn = useCallback(async (title: string) => {
    try {
      const maxOrder = columns.reduce((max, col) => Math.max(max, col.order), -1);
      const newColumn = await createColumn({
        title,
        order: maxOrder + 1,
      });
      setColumns(prev => [...prev, newColumn].sort((a, b) => a.order - b.order));
      return newColumn;
    } catch (err) {
      setError('添加列失败');
      console.error(err);
      throw err;
    }
  }, [columns]);

  const editColumn = useCallback(async (id: string, title: string) => {
    try {
      const updated = await updateColumn(id, { title });
      setColumns(prev => prev.map(col => col.id === id ? updated : col));
      return updated;
    } catch (err) {
      setError('更新列失败');
      console.error(err);
      throw err;
    }
  }, []);

  const removeColumn = useCallback(async (id: string) => {
    try {
      await deleteColumnApi(id);
      setColumns(prev => prev.filter(col => col.id !== id));
    } catch (err) {
      setError('删除列失败');
      console.error(err);
      throw err;
    }
  }, []);

  return {
    columns,
    loading,
    error,
    addColumn,
    editColumn,
    removeColumn,
    refreshColumns: fetchColumns,
  };
}
