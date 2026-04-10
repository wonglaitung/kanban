import { useState, useCallback } from 'react';
import { DndContext, DragOverlay, closestCorners, PointerSensor, KeyboardSensor, useSensor, useSensors, DragStartEvent, DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import type { Column as ColumnType, Task } from '../../types';
import { Column } from '../Column';
import { TaskCard } from '../TaskCard';
import './Board.css';

interface BoardProps {
  columns: ColumnType[];
  tasks: Task[];
  totalTasks?: number;
  onAddTask: (columnId: string) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onEditColumn: (column: ColumnType) => void;
  onDeleteColumn: (columnId: string) => void;
  onAddColumn: () => void;
  onTaskMove: (taskId: string, targetColumnId: string, newOrder: number) => Promise<void>;
  onReorder: (updates: Array<{ id: string; order: number; columnId?: string }>) => Promise<void>;
}

export function Board({
  columns,
  tasks,
  totalTasks,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onEditColumn,
  onDeleteColumn,
  onAddColumn,
  onTaskMove: _onTaskMove,
  onReorder,
}: BoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find(t => t.id === active.id);
    setActiveTask(task || null);
  }, [tasks]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (!over || !activeTask) {
      setOverColumnId(null);
      return;
    }

    const overId = over.id as string;
    
    const column = columns.find(c => c.id === overId);
    if (column) {
      setOverColumnId(column.id);
      return;
    }

    const overTask = tasks.find(t => t.id === overId);
    if (overTask) {
      setOverColumnId(overTask.columnId);
    }
  }, [columns, tasks, activeTask]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    
    const currentActiveTask = activeTask;
    setActiveTask(null);
    setOverColumnId(null);

    if (!over || !currentActiveTask) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    let targetColumnId: string;
    let insertOrder: number;

    const overColumn = columns.find(c => c.id === overId);
    if (overColumn) {
      targetColumnId = overColumn.id;
      const columnTasks = tasks.filter(t => t.columnId === targetColumnId && t.id !== activeId);
      insertOrder = columnTasks.length;
    } else {
      const overTask = tasks.find(t => t.id === overId);
      if (!overTask) return;
      targetColumnId = overTask.columnId;
      insertOrder = overTask.order;
    }

    // Calculate reorder updates
    const updates: Array<{ id: string; order: number; columnId?: string }> = [];
    
    // Get all tasks in target column (excluding the moved task)
    const targetColumnTasks = tasks
      .filter(t => t.columnId === targetColumnId && t.id !== activeId)
      .sort((a, b) => a.order - b.order);

    // Calculate new order for moved task
    const sameColumn = currentActiveTask.columnId === targetColumnId;
    
    if (sameColumn) {
      // Reordering within same column
      targetColumnTasks.forEach((task, index) => {
        const newOrder = index >= insertOrder ? index + 1 : index;
        updates.push({ id: task.id, order: newOrder });
      });
      updates.push({ id: activeId, order: insertOrder });
    } else {
      // Moving to different column
      // Update tasks in source column
      const sourceColumnTasks = tasks
        .filter(t => t.columnId === currentActiveTask.columnId && t.id !== activeId)
        .sort((a, b) => a.order - b.order);
      
      sourceColumnTasks.forEach((task, index) => {
        updates.push({ id: task.id, order: index, columnId: currentActiveTask.columnId });
      });

      // Update tasks in target column
      targetColumnTasks.forEach((task, index) => {
        const newOrder = index >= insertOrder ? index + 1 : index;
        updates.push({ id: task.id, order: newOrder, columnId: targetColumnId });
      });

      // Add the moved task
      updates.push({ id: activeId, order: insertOrder, columnId: targetColumnId });
    }

    await onReorder(updates);
  }, [columns, tasks, activeTask, onReorder]);

  const getTasksByColumn = useCallback((columnId: string) => {
    return tasks
      .filter(task => task.columnId === columnId)
      .sort((a, b) => a.order - b.order);
  }, [tasks]);

  const isFiltering = totalTasks !== undefined && tasks.length !== totalTasks;

  return (
    <div className="board-container">
      {isFiltering && (
        <div className="filter-indicator">
          <span>显示 {tasks.length} / {totalTasks} 个任务</span>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="board">
          {columns.map(column => (
            <Column
              key={column.id}
              column={column}
              tasks={getTasksByColumn(column.id)}
              onAddTask={onAddTask}
              onEditTask={onEditTask}
              onDeleteTask={onDeleteTask}
              onEditColumn={onEditColumn}
              onDeleteColumn={onDeleteColumn}
              isOver={overColumnId === column.id}
              canDelete={columns.length > 1}
            />
          ))}
          
          <button className="add-column-btn" onClick={onAddColumn}>
            + 添加列
          </button>
        </div>

        <DragOverlay>
          {activeTask && (
            <div className="drag-overlay-card">
              <TaskCard
                task={activeTask}
                onEdit={() => {}}
                onDelete={() => {}}
                isDragging
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
