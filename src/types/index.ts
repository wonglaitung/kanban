export interface Column {
  id: string;
  title: string;
  order: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;
  priority: 'high' | 'medium' | 'low';
  dueDate: string;
  tags: string[];
  columnId: string;
  order: number;
  progress: number; // 0-100
  progressText: string; // 进度描述文字
  createdAt: string;
  updatedAt: string;
}

export type Theme = 'dark-neon' | 'light' | 'dark';

export type StaleFilter = 'all' | '1day' | '3days' | '5days';

export interface Settings {
  token: string;
  theme: Theme;
}

export interface DragDropContext {
  activeTask: Task | null;
  overColumnId: string | null;
}

export interface Comment {
  id: string;
  taskId: string;
  author: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export const PRIORITY_COLORS = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981',
} as const;

export const PRIORITY_LABELS = {
  high: '高',
  medium: '中',
  low: '低',
} as const;
