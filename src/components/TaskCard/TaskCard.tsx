// import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../../types';
import { PRIORITY_COLORS, PRIORITY_LABELS } from '../../types';
import './TaskCard.css';

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  isDragging?: boolean;
}

export function TaskCard({ task, onEdit, onDelete, isDragging }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priorityColor = PRIORITY_COLORS[task.priority];
  const priorityLabel = PRIORITY_LABELS[task.priority];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-card ${isSortableDragging ? 'dragging' : ''}`}
      onClick={() => onEdit(task)}
    >
      <div className="task-card-header" {...attributes} {...listeners}>
        <h4 className="task-title">{task.title}</h4>
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
      
      {task.description && (
        <p className="task-description">{task.description}</p>
      )}
      
      {(task.progress !== undefined && task.progress >= 0) && (
        <div className="task-progress-section">
          <div className="task-progress-header">
            <span className="task-progress-label">进度</span>
            <span className="task-progress-percent">{task.progress}%</span>
          </div>
          <div className="task-progress-bar">
            <div
              className="task-progress-fill"
              style={{ width: `${task.progress}%` }}
            />
          </div>
          {task.progressText && (
            <p className="task-progress-text">{task.progressText}</p>
          )}
        </div>
      )}

      <div className="task-meta">
        <span className="task-assignee">
          <span className="avatar">👤</span>
          {task.assignee}
        </span>
        <span
          className="task-priority"
          style={{ backgroundColor: priorityColor }}
        >
          {priorityLabel}
        </span>
      </div>
      
      <div className="task-footer">
        {task.dueDate && (
          <span className="task-due-date">
            📅 {task.dueDate}
          </span>
        )}
        {task.tags && task.tags.length > 0 && (
          <div className="task-tags">
            {task.tags.map(tag => (
              <span key={tag} className="task-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
