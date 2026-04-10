import { useState, useEffect, useCallback, useMemo } from 'react';
import { Board } from './components/Board';
import { TaskModal } from './components/TaskModal';
import { ColumnModal } from './components/ColumnModal';
import { TokenModal } from './components/TokenModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { useColumns } from './hooks/useColumns';
import { useTasks } from './hooks/useTasks';
import { getSettings, updateSettings } from './services/api';
import type { Task, Column as ColumnType } from './types';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isTokenSetup, setIsTokenSetup] = useState(false);
  const [storedToken, setStoredToken] = useState('');
  const [showTokenModal, setShowTokenModal] = useState(true);

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<ColumnType | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'task' | 'column'; id: string; taskCount?: number } | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [showChangeToken, setShowChangeToken] = useState(false);

  const { columns, loading: columnsLoading, addColumn, editColumn, removeColumn } = useColumns();
  const { tasks, loading: tasksLoading, addTask, editTask, removeTask, duplicateTask, reorderTasks } = useTasks();

  // Filter tasks based on search query
  const filteredTasks = useMemo(() => {
    if (!filterQuery.trim()) return tasks;
    const query = filterQuery.toLowerCase();
    return tasks.filter(task =>
      task.title?.toLowerCase().includes(query) ||
      task.description?.toLowerCase().includes(query) ||
      task.assignee?.toLowerCase().includes(query) ||
      task.tags?.some(tag => tag.toLowerCase().includes(query))
    );
  }, [tasks, filterQuery]);

  // Check token on mount
  useEffect(() => {
    const checkToken = async () => {
      try {
        const settings = await getSettings();
        const currentToken = settings.token || '';
        setStoredToken(currentToken);
        setIsTokenSetup(true);

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
    await updateSettings({ token });
    setStoredToken(token);
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
          <div className="header-left">
            <h1>📋 看板系统</h1>
            <span className="subtitle">简单高效的任务管理</span>
          </div>
          <div className="header-right">
            <button
              className="change-token-btn"
              onClick={() => setShowChangeToken(true)}
              title="修改令牌"
            >
              🔐 修改令牌
            </button>
            <div className="search-box">
              <span className="search-icon">🔍</span>
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
        </div>
      </header>

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