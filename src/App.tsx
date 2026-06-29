import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Board } from './components/Board';
import { TaskModal } from './components/TaskModal';
import { ColumnModal } from './components/ColumnModal';
import { TokenModal } from './components/TokenModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { SettingsMenu } from './components/SettingsMenu';
import AIChat from './components/AIChat/AIChat';
import { useColumns } from './hooks/useColumns';
import { useTasks } from './hooks/useTasks';
import { getSettings, updateSettings, exportCsv } from './services/api';
import type { Task, Column as ColumnType, Theme, StaleFilter } from './types';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isTokenSetup, setIsTokenSetup] = useState(false);
  const [storedToken, setStoredToken] = useState('');
  const [showTokenModal, setShowTokenModal] = useState(true);
  const [currentTheme, setCurrentTheme] = useState<Theme>('navy-gold');

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<ColumnType | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'task' | 'column'; id: string; taskCount?: number } | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [staleFilter, setStaleFilter] = useState<StaleFilter>('all');
  const [showChangeToken, setShowChangeToken] = useState(false);
  const [copilotExpanded, setCopilotExpanded] = useState(false);
  const [copilotWidth, setCopilotWidth] = useState(() => {
    const saved = localStorage.getItem('copilot-width');
    return saved ? parseInt(saved, 10) : 400;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);

  const { columns, loading: columnsLoading, addColumn, editColumn, removeColumn } = useColumns();
  const { tasks, loading: tasksLoading, addTask, editTask, removeTask, duplicateTask, reorderTasks } = useTasks();

  // Sidebar resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = copilotWidth;
  }, [copilotWidth]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const deltaX = resizeStartXRef.current - e.clientX;
    const newWidth = Math.min(Math.max(resizeStartWidthRef.current + deltaX, 280), 600);
    setCopilotWidth(newWidth);
  }, [isResizing]);

  const handleResizeEnd = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      localStorage.setItem('copilot-width', String(copilotWidth));
    }
  }, [isResizing, copilotWidth]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // Filter tasks based on search query and stale filter
  const filteredTasks = useMemo(() => {
    let result = tasks;

    // Apply stale filter
    if (staleFilter !== 'all') {
      const daysMap = { '1day': 1, '3days': 3, '5days': 5 };
      const days = daysMap[staleFilter];
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      result = result.filter(task => {
        if (!task.updatedAt) return true;
        return new Date(task.updatedAt).getTime() < cutoff;
      });
    }

    // Apply search query
    if (filterQuery.trim()) {
      const query = filterQuery.toLowerCase();
      result = result.filter(task =>
        task.title?.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        task.assignee?.toLowerCase().includes(query) ||
        task.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    return result;
  }, [tasks, filterQuery, staleFilter]);

  // Check token on mount
  useEffect(() => {
    const checkToken = async () => {
      try {
        const settings = await getSettings();
        const currentToken = settings.token || '';
        setStoredToken(currentToken);
        setIsTokenSetup(true);

        // Load and apply theme
        const theme = (settings.theme as Theme) || 'navy-gold';
        setCurrentTheme(theme);
        document.documentElement.setAttribute('data-theme', theme);

        // Check if already authenticated in this session
        const authKey = 'kanban_auth';
        const storedAuth = sessionStorage.getItem(authKey);
        if (storedAuth) {
          const authData = JSON.parse(storedAuth);
          // Verify the stored token matches current token
          if (authData.token === currentToken) {
            setIsAuthenticated(true);
            setShowTokenModal(false);
          } else {
            // Token changed, clear auth
            sessionStorage.removeItem(authKey);
          }
        }
      } catch (error) {
        console.error('Failed to check token:', error);
        setShowTokenModal(true);
      }
    };
    checkToken();
  }, []);

  const handleSetToken = async (token: string) => {
    await updateSettings({ token, theme: currentTheme });
    setStoredToken(token);
  };

  const handleThemeChange = async (theme: Theme) => {
    setCurrentTheme(theme);
    document.documentElement.setAttribute('data-theme', theme);
    await updateSettings({ token: storedToken, theme });
  };

  const handleTokenSuccess = (token: string) => {
    setIsAuthenticated(true);
    setShowTokenModal(false);
    // Store auth state in sessionStorage
    const authKey = 'kanban_auth';
    sessionStorage.setItem(authKey, JSON.stringify({ token, timestamp: Date.now() }));
  };

  // Task handlers
  const handleAddTask = useCallback((columnId: string) => {
    setActiveColumnId(columnId);
    setSelectedTask(null);
    setShowTaskModal(true);
  }, []);

  const handleEditTask = useCallback((task: Task) => {
    setSelectedTask(task);
    setActiveColumnId(task.columnId);
    setShowTaskModal(true);
  }, []);

  const handleDeleteTask = useCallback((taskId: string) => {
    setDeleteTarget({ type: 'task', id: taskId });
    setShowDeleteConfirm(true);
  }, []);

  const handleDuplicateTask = useCallback(async (taskId: string) => {
    try {
      await duplicateTask(taskId);
    } catch (error) {
      console.error('Failed to duplicate task:', error);
      alert('复制任务失败，请重试');
    }
  }, [duplicateTask]);

  const handleConfirmDeleteTask = async () => {
    if (deleteTarget?.type === 'task') {
      await removeTask(deleteTarget.id);
    }
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
  };

  const handleSaveTask = async (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'order'>) => {
    if (selectedTask) {
      await editTask(selectedTask.id, taskData);
    } else {
      await addTask(taskData);
    }
  };

  // Column handlers
  const handleAddColumn = useCallback(() => {
    setSelectedColumn(null);
    setShowColumnModal(true);
  }, []);

  const handleEditColumn = useCallback((column: ColumnType) => {
    setSelectedColumn(column);
    setShowColumnModal(true);
  }, []);

  const handleDeleteColumn = useCallback((columnId: string) => {
    const taskCount = tasks.filter(t => t.columnId === columnId).length;
    setDeleteTarget({ type: 'column', id: columnId, taskCount });
    setShowDeleteConfirm(true);
  }, [tasks]);

  const handleConfirmDeleteColumn = async () => {
    if (deleteTarget?.type === 'column' && columns.length > 1) {
      // Move tasks to previous column (or next if first)
      const columnIndex = columns.findIndex(c => c.id === deleteTarget.id);
      const targetColumn = columns[columnIndex === 0 ? 1 : columnIndex - 1];
      
      const columnTasks = tasks.filter(t => t.columnId === deleteTarget.id);
      const updates = columnTasks.map((task, index) => ({
        id: task.id,
        order: index,
        columnId: targetColumn.id,
      }));
      
      if (updates.length > 0) {
        await reorderTasks(updates);
      }
      
      await removeColumn(deleteTarget.id);
    }
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
  };

  const handleSaveColumn = async (title: string) => {
    if (selectedColumn) {
      await editColumn(selectedColumn.id, title);
    } else {
      await addColumn(title);
    }
  };

  // Reorder handler
  const handleReorder = async (updates: Array<{ id: string; order: number; columnId?: string }>) => {
    await reorderTasks(updates);
  };

  // Export CSV handler
  const handleExportCsv = async () => {
    try {
      const blob = await exportCsv();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kanban-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export CSV:', error);
      alert('导出失败，请重试');
    }
  };

  // AI 导航处理
  const handleNavigate = (page: string, params?: Record<string, unknown>) => {
    if (page === 'settings') {
      setShowChangeToken(true);
    } else if (page === 'board') {
      // 关闭所有弹窗，返回看板
      setShowTaskModal(false);
      setShowColumnModal(false);
      setShowChangeToken(false);
      setSelectedTask(null);
      setSelectedColumn(null);
    } else if (page === 'task') {
      // 导航到任务详情
      let task: Task | null = null;

      if (params?.taskId) {
        // 通过 ID 精确匹配
        task = tasks.find(t => t.id === params.taskId) || null;
      } else if (params?.taskTitle) {
        // 通过标题模糊匹配
        const title = String(params.taskTitle).toLowerCase();
        task = tasks.find(t => t.title?.toLowerCase().includes(title)) || null;
      }

      if (task) {
        setSelectedTask(task);
        setActiveColumnId(task.columnId);
        setShowTaskModal(true);
      }
    }
  };

  // Loading state
  if (columnsLoading || tasksLoading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <p>加载中...</p>
      </div>
    );
  }

  // Token protection
  if (!isAuthenticated && showTokenModal) {
    return (
      <TokenModal
        isSetup={isTokenSetup}
        storedToken={storedToken}
        onSuccess={handleTokenSuccess}
        onSetToken={handleSetToken}
      />
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>智能看板系统</h1>
          <div className="header-center">
            <select
              className="stale-filter-select"
              value={staleFilter}
              onChange={(e) => setStaleFilter(e.target.value as StaleFilter)}
              title="筛选未更新任务"
            >
              <option value="all">全部任务</option>
              <option value="1day">1天未更新</option>
              <option value="3days">3天未更新</option>
              <option value="5days">5天未更新</option>
            </select>
            <div className="search-box">
              <span className="search-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
              </span>
              <input
                type="text"
                placeholder="搜索任务、负责人、标签..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="search-input"
              />
              {filterQuery && (
                <button
                  className="clear-search"
                  onClick={() => setFilterQuery('')}
                  title="清除搜索"
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <div className="header-right">
            <SettingsMenu
              currentTheme={currentTheme}
              onThemeChange={handleThemeChange}
              onChangeToken={() => setShowChangeToken(true)}
              onExportCsv={handleExportCsv}
            />
          </div>
        </div>
      </header>

      <div className="app-content">
        <main className="app-main">
          <Board
            columns={columns}
            tasks={filteredTasks}
            totalTasks={tasks.length}
            onAddTask={handleAddTask}
            onEditTask={handleEditTask}
            onDeleteTask={handleDeleteTask}
            onDuplicateTask={handleDuplicateTask}
            onEditColumn={handleEditColumn}
            onDeleteColumn={handleDeleteColumn}
            onAddColumn={handleAddColumn}
            onTaskMove={async () => {}}
            onReorder={handleReorder}
          />
        </main>

        {/* AI Copilot Sidebar */}
        <aside
          className={`copilot-sidebar ${copilotExpanded ? 'expanded' : 'collapsed'}`}
          style={copilotExpanded ? { width: `${copilotWidth}px` } : undefined}
        >
          {copilotExpanded ? (
            <>
              <div
                className="copilot-resize-handle"
                onMouseDown={handleResizeStart}
              />
              <AIChat onClose={() => setCopilotExpanded(false)} onNavigate={handleNavigate} />
            </>
          ) : (
            <button
              className="copilot-toggle-btn"
              onClick={() => setCopilotExpanded(true)}
              title="展开智能助手"
            >
              <img src="/icon.svg" alt="AI" width="18" height="21" />
            </button>
          )}
        </aside>
      </div>

      {/* Task Modal */}
      {showTaskModal && (
        <TaskModal
          task={selectedTask}
          columnId={activeColumnId}
          onSave={handleSaveTask}
          onClose={() => {
            setShowTaskModal(false);
            setSelectedTask(null);
          }}
        />
      )}

      {/* Column Modal */}
      {showColumnModal && (
        <ColumnModal
          column={selectedColumn}
          onSave={handleSaveColumn}
          onClose={() => {
            setShowColumnModal(false);
            setSelectedColumn(null);
          }}
        />
      )}

      {/* Confirm Dialog */}
      {showDeleteConfirm && deleteTarget && (
        <ConfirmDialog
          title={deleteTarget.type === 'task' ? '删除任务' : '删除列'}
          message={
            deleteTarget.type === 'task'
              ? '确定要删除这个任务吗？此操作无法撤销。'
              : `确定要删除这个列吗？该列中的 ${deleteTarget.taskCount} 个任务将移动到前一列。`
          }
          confirmText="删除"
          danger
          onConfirm={deleteTarget.type === 'task' ? handleConfirmDeleteTask : handleConfirmDeleteColumn}
          onCancel={() => {
            setShowDeleteConfirm(false);
            setDeleteTarget(null);
          }}
        />
      )}

      {/* Change Token Modal */}
      {showChangeToken && (
        <TokenModal
          isSetup={true}
          storedToken=""
          onSuccess={async (newToken) => {
            await handleSetToken(newToken);
            setShowChangeToken(false);
            alert('令牌修改成功！');
          }}
          onSetToken={handleSetToken}
          onClose={() => setShowChangeToken(false)}
        />
      )}
    </div>
  );
}

export default App;