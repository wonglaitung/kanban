import axios from 'axios';
import type { Column, Task, Settings } from '../types';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Column API
export const getColumns = async (): Promise<Column[]> => {
  const response = await api.get<Column[]>('/columns');
  return response.data.sort((a, b) => a.order - b.order);
};

export const createColumn = async (column: Omit<Column, 'id'>): Promise<Column> => {
  const response = await api.post<Column>('/columns', column);
  return response.data;
};

export const updateColumn = async (id: string, updates: Partial<Column>): Promise<Column> => {
  const response = await api.put<Column>(`/columns/${id}`, updates);
  return response.data;
};

export const deleteColumn = async (id: string): Promise<void> => {
  await api.delete(`/columns/${id}`);
};

// Task API
export const getTasks = async (): Promise<Task[]> => {
  const response = await api.get<Task[]>('/tasks');
  return response.data.sort((a, b) => a.order - b.order);
};

export const getTask = async (id: string): Promise<Task> => {
  const response = await api.get<Task>(`/tasks/${id}`);
  return response.data;
};

export const createTask = async (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> => {
  const now = new Date().toISOString();
  const newTask = {
    ...task,
    createdAt: now,
    updatedAt: now,
  };
  const response = await api.post<Task>('/tasks', newTask);
  return response.data;
};

export const updateTask = async (id: string, updates: Partial<Task>): Promise<Task> => {
  const response = await api.put<Task>(`/tasks/${id}`, updates);
  return response.data;
};

export const deleteTask = async (id: string): Promise<void> => {
  await api.delete(`/tasks/${id}`);
};

export const duplicateTask = async (id: string): Promise<Task> => {
  const response = await api.post<Task>(`/tasks/${id}/duplicate`);
  return response.data;
};

// Batch update tasks
export const batchUpdateTasks = async (updates: Array<{ id: string; order: number; columnId?: string }>): Promise<Task[]> => {
  const response = await api.post<Task[]>('/tasks/batch', { updates });
  return response.data;
};

// Settings API
export const getSettings = async (): Promise<Settings> => {
  const response = await api.get<Settings>('/settings');
  return response.data;
};

export const updateSettings = async (settings: Settings): Promise<Settings> => {
  const response = await api.put<Settings>('/settings', settings);
  return response.data;
};

// Conflict error type
export class ConflictError extends Error {
  public currentData: Task;
  constructor(message: string, currentData: Task) {
    super(message);
    this.name = 'ConflictError';
    this.currentData = currentData;
  }
}

// Add response interceptor for conflict handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 409) {
      throw new ConflictError(
        error.response.data.error,
        error.response.data.currentData
      );
    }
    throw error;
  }
);

export default api;