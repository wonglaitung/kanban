import { useState, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../../types';
import { PRIORITY_COLORS, PRIORITY_LABELS } from '../../types';
import { getComments } from '../../services/api';
import './TaskCard.css';

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onDuplicate: (taskId: string) => void;
  isDragging?: boolean;
}

function formatUpdateTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;
  
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export function TaskCard({ task, onEdit, onDelete, onDuplicate, isDragging: _isDragging }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id });

  const [commentCount, setCommentCount] = useState(0);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priorityColor = PRIORITY_COLORS[task.priority];
  const priorityLabel = PRIORITY_LABELS[task.priority];

  // Load comment count
  useEffect(() => {
    const loadCommentCount = async () => {
      try {
        const comments = await getComments(task.id);
        setCommentCount(comments.length);
      } catch (error) {
        // Ignore error, just show 0
        setCommentCount(0);
      }
    };
    loadCommentCount();
  }, [task.id]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-card ${isSortableDragging ? 'dragging' : ''}`}
      onClick={() => onEdit(task)}
    >
      <div className="task-card-header" {...attributes} {...listeners}>
        <h4 className="task-title">{task.title}</h4>
        <div className="task-card-actions">
          <button
            className="duplicate-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(task.id);
            }}
            title="复制任务"
          >
            📋
          </button>
          <button
            className="delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            title="删除任务"
          >
            ×
          </button>
        </div>
      </div>
      
      {task.description && (
        <p className="task-description">{task.description}</p>
      )}
      
      {(task.progress !== undefined && task.progress >= 0) && (
        <div className="task-progress-inline">
          <span className="task-progress-label">进度 {task.progress}%</span>
          {task.progressText && (
            <span className="task-progress-text">{task.progressText}</span>
          )}
        </div>
      )}

      <div className="task-meta">
        <span className="task-assignee">
          <span className="avatar">👤</span>
          {task.assignee}
        </span>
        {task.dueDate && (
          <span className="task-due-date">
            {task.dueDate}
          </span>
        )}
        <span
          className="task-priority"
          style={{ backgroundColor: priorityColor }}
        >
          {priorityLabel}
        </span>
      </div>
      
      <div className="task-footer">
        <div className="task-footer-row">
          {task.tags && task.tags.length > 0 && (
            <div className="task-tags">
              {task.tags.map(tag => (
                <span key={tag} className="task-tag">{tag}</span>
              ))}
            </div>
          )}
          <div className="task-footer-meta">
            {commentCount > 0 && (
              <span className="task-comments-count" title={`${commentCount} 条评论`}>
                💬 {commentCount}
              </span>
            )}
            {task.updatedAt && (
              <span className="task-updated">
                更新于 {formatUpdateTime(task.updatedAt)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
