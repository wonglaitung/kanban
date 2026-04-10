import { useState, useEffect, useCallback } from 'react';
import type { Task } from '../types';
import { getTasks, createTask, updateTask, deleteTask as deleteTaskApi, duplicateTask as duplicateTaskApi } from '../services/api';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getTasks();
      setTasks(data);
      setError(null);
    } catch (err) {
      setError('获取任务数据失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const getTasksByColumn = useCallback((columnId: string) => {
    return tasks
      .filter(task => task.columnId === columnId)
      .sort((a, b) => a.order - b.order);
  }, [tasks]);

  const addTask = useCallback(async (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'order'>) => {
    try {
      const columnTasks = tasks.filter(t => t.columnId === task.columnId);
      const maxOrder = columnTasks.reduce((max, t) => Math.max(max, t.order), -1);
      const newTask = await createTask({
        ...task,
        order: maxOrder + 1,
      });
      setTasks(prev => [...prev, newTask].sort((a, b) => a.order - b.order));
      return newTask;
    } catch (err) {
      setError('添加任务失败');
      console.error(err);
      throw err;
    }
  }, [tasks]);

  const editTask = useCallback(async (id: string, updates: Partial<Task>) => {
    try {
      const updated = await updateTask(id, updates);
      setTasks(prev => prev.map(task => task.id === id ? updated : task));
      return updated;
    } catch (err) {
      setError('更新任务失败');
      console.error(err);
      throw err;
    }
  }, []);

  const removeTask = useCallback(async (id: string) => {
    try {
      await deleteTaskApi(id);
      setTasks(prev => prev.filter(task => task.id !== id));
    } catch (err) {
      setError('删除任务失败');
      console.error(err);
      throw err;
    }
  }, []);

  const duplicateTask = useCallback(async (id: string) => {
    try {
      const newTask = await duplicateTaskApi(id);
      setTasks(prev => [...prev, newTask].sort((a, b) => a.order - b.order));
      return newTask;
    } catch (err) {
      setError('复制任务失败');
      console.error(err);
      throw err;
    }
  }, []);

  const moveTask = useCallback(async (taskId: string, targetColumnId: string, newOrder: number) => {
    try {
      const updated = await updateTask(taskId, {
        columnId: targetColumnId,
        order: newOrder,
      });
      setTasks(prev => {
        const filtered = prev.filter(t => t.id !== taskId);
        return [...filtered, updated].sort((a, b) => a.order - b.order);
      });
      return updated;
    } catch (err) {
      setError('移动任务失败');
      console.error(err);
      throw err;
    }
  }, []);

  const reorderTasks = useCallback(async (updates: Array<{ id: string; order: number; columnId?: string }>) => {
    try {
      const promises = updates.map(({ id, order, columnId }) => {
        const updateData: Partial<Task> = { order };
        if (columnId) updateData.columnId = columnId;
        return updateTask(id, updateData);
      });
      const updatedTasks = await Promise.all(promises);
      setTasks(prev => {
        const updatedMap = new Map(updatedTasks.map(t => [t.id, t]));
        return prev.map(t => {
          const updated = updatedMap.get(t.id);
          if (updated) {
            return { ...t, ...updated };
          }
          return t;
        }).sort((a, b) => a.order - b.order);
      });
    } catch (err) {
      setError('重排序任务失败');
      console.error(err);
      throw err;
    }
  }, []);

  return {
    tasks,
    loading,
    error,
    getTasksByColumn,
    addTask,
    editTask,
    removeTask,
    duplicateTask,
    moveTask,
    reorderTasks,
    refreshTasks: fetchTasks,
  };
}
