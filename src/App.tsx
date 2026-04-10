import React, { useState, useEffect, useCallback } from 'react';
import { Board } from './components/Board';
import { TaskModal } from './components/TaskModal';
import { ColumnModal } from './components/ColumnModal';
import { PasswordModal } from './components/PasswordModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { useColumns } from './hooks/useColumns';
import { useTasks } from './hooks/useTasks';
import { getSettings, updateSettings } from './services/api';
import type { Task, Column as ColumnType } from './types';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isPasswordSetup, setIsPasswordSetup] = useState(false);
  const [storedHash, setStoredHash] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(true);

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<ColumnType | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'task' | 'column'; id: string; taskCount?: number } | null>(null);

  const { columns, loading: columnsLoading, addColumn, editColumn, removeColumn } = useColumns();
  const { tasks, loading: tasksLoading, addTask, editTask, removeTask, reorderTasks, getTasksByColumn } = useTasks();

  // Check password on mount
  useEffect(() => {
    const checkPassword = async () => {
      try {
        const settings = await getSettings();
        const currentHash = settings.password || '';
        setStoredHash(currentHash);
        setIsPasswordSetup(true);

        // Check if already authenticated in this session
        const authKey = 'kanban_auth';
        const storedAuth = sessionStorage.getItem(authKey);
        if (storedAuth) {
          const authData = JSON.parse(storedAuth);
          // Verify the stored hash matches current password hash
          if (authData.hash === currentHash) {
            setIsAuthenticated(true);
            setShowPasswordModal(false);
          } else {
            // Password changed, clear auth
            sessionStorage.removeItem(authKey);
          }
        }
      } catch (error) {
        console.error('Failed to check password:', error);
        setShowPasswordModal(true);
      }
    };
    checkPassword();
  }, []);

  const handleSetPassword = async (hash: string) => {
    await updateSettings({ password: hash });
    setStoredHash(hash);
  };

  const handlePasswordSuccess = () => {
    setIsAuthenticated(true);
    setShowPasswordModal(false);
    // Store auth state in sessionStorage
    const authKey = 'kanban_auth';
    sessionStorage.setItem(authKey, JSON.stringify({ hash: storedHash, timestamp: Date.now() }));
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

  // Password protection
  if (!isAuthenticated && showPasswordModal) {
    return (
      <PasswordModal
        isSetup={isPasswordSetup}
        storedHash={storedHash}
        onSuccess={handlePasswordSuccess}
        onSetPassword={handleSetPassword}
      />
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>📋 看板系统</h1>
          <p className="subtitle">简单高效的任务管理</p>
        </div>
      </header>

      <main className="app-main">
        <Board
          columns={columns}
          tasks={tasks}
          onAddTask={handleAddTask}
          onEditTask={handleEditTask}
          onDeleteTask={handleDeleteTask}
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
    </div>
  );
}

export default App;
