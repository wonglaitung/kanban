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
  const now = new Date().toISOString();
  // First fetch existing task data
  const existingResponse = await api.get<Task>(`/tasks/${id}`);
  const existingTask = existingResponse.data;
  // Merge existing data with updates
  const mergedTask = {
    ...existingTask,
    ...updates,
    updatedAt: now,
  };
  const response = await api.put<Task>(`/tasks/${id}`, mergedTask);
  return response.data;
};

export const deleteTask = async (id: string): Promise<void> => {
  await api.delete(`/tasks/${id}`);
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

// Utility: Simple hash function for password
export const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
};

export default api;
