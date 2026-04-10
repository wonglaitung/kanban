import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Column as ColumnType, Task } from '../../types';
import { TaskCard } from '../TaskCard';
import './Column.css';

interface ColumnProps {
  column: ColumnType;
  tasks: Task[];
  onAddTask: (columnId: string) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onEditColumn: (column: ColumnType) => void;
  onDeleteColumn: (columnId: string) => void;
  isOver?: boolean;
  canDelete?: boolean;
}

export function Column({
  column,
  tasks,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onEditColumn,
  onDeleteColumn,
  isOver,
  canDelete = true,
}: ColumnProps) {
  const [showMenu, setShowMenu] = useState(false);
  
  const { setNodeRef, isOver: isDroppableOver } = useDroppable({
    id: column.id,
  });

  const isColumnOver = isOver || isDroppableOver;

  return (
    <div
      ref={setNodeRef}
      className={`column ${isColumnOver ? 'column-over' : ''}`}
    >
      <div className="column-header">
        <h3
          className="column-title"
          onDoubleClick={() => onEditColumn(column)}
          title="双击编辑列名"
        >
          {column.title}
          <span className="task-count">{tasks.length}</span>
        </h3>
        <div className="column-actions">
          <button
            className="add-task-btn"
            onClick={() => onAddTask(column.id)}
            title="添加任务"
          >
            +
          </button>
          <div className="column-menu">
            <button
              className="menu-btn"
              onClick={() => setShowMenu(!showMenu)}
            >
              ⋮
            </button>
            {showMenu && (
              <div className="menu-dropdown">
                <button
                  className="menu-item"
                  onClick={() => {
                    onEditColumn(column);
                    setShowMenu(false);
                  }}
                >
                  编辑列名
                </button>
                {canDelete && (
                  <button
                    className="menu-item danger"
                    onClick={() => {
                      onDeleteColumn(column.id);
                      setShowMenu(false);
                    }}
                  >
                    删除列
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="column-content">
        <SortableContext
          items={tasks.map(t => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={onEditTask}
              onDelete={onDeleteTask}
            />
          ))}
        </SortableContext>
        
        {tasks.length === 0 && (
          <div className="empty-column">
            <p>暂无任务</p>
            <button
              className="add-task-btn-empty"
              onClick={() => onAddTask(column.id)}
            >
              + 添加任务
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
