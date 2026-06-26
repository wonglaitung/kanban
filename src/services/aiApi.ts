/**
 * AI API 服务
 * 与 Python AI 服务通信
 */

const API_BASE = '/api/ai';

export interface ChatRequest {
  message: string;
  session_id?: string;
}

export interface ChatResponse {
  content: string;
  session_id: string;
}

export interface TaskDictionary {
  fields: Array<{
    name: string;
    display_name: string;
    type: string;
    description: string;
    filterable: boolean;
    values?: string[];
    display_values?: Record<string, string>;
  }>;
  dimensions: Array<{
    name: string;
    display_name: string;
    description: string;
  }>;
  query_time: string;
}

export interface TaskQueryResult {
  total: number;
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    assignee: string;
    dueDate: string;
    progress: number;
    progressText: string;
    tags: string[];
    overdue: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  query_time: string;
}

/**
 * 获取任务数据字典
 */
export async function getTaskDictionary(): Promise<TaskDictionary> {
  const response = await fetch(`${API_BASE}/dictionary`);
  if (!response.ok) {
    throw new Error(`获取字典失败: ${response.statusText}`);
  }
  return response.json();
}

/**
 * 查询任务数据
 */
export async function queryTasks(params: {
  status?: string;
  priority?: string;
  assignee?: string;
  overdue?: boolean;
  tags?: string;
  limit?: number;
}): Promise<TaskQueryResult> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.append('status', params.status);
  if (params.priority) searchParams.append('priority', params.priority);
  if (params.assignee) searchParams.append('assignee', params.assignee);
  if (params.overdue !== undefined) searchParams.append('overdue', String(params.overdue));
  if (params.tags) searchParams.append('tags', params.tags);
  if (params.limit) searchParams.append('limit', String(params.limit));

  const response = await fetch(`${API_BASE}/query?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`查询任务失败: ${response.statusText}`);
  }
  return response.json();
}

/**
 * AI 对话
 */
export async function chat(message: string, sessionId?: string): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      session_id: sessionId,
    } as ChatRequest),
  });
  if (!response.ok) {
    throw new Error(`对话失败: ${response.statusText}`);
  }
  return response.json();
}
