import { useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import type { Task, Column } from '../types';

interface UseDragDropProps {
  tasks: Task[];
  columns: Column[];
  onTaskMove: (taskId: string, targetColumnId: string, newOrder: number) => Promise<void>;
  onReorder: (updates: Array<{ id: string; order: number; columnId?: string }>) => Promise<void>;
}

export function useDragDrop({ tasks, columns, onTaskMove: _onTaskMove, onReorder }: UseDragDropProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = useCallback((event: DragStartEvent, setActiveTask: (task: Task | null) => void) => {
    const { active } = event;
    const task = tasks.find(t => t.id === active.id);
    setActiveTask(task || null);
  }, [tasks]);

  const handleDragOver = useCallback((event: DragOverEvent, activeTask: Task | null, setOverColumnId: (id: string | null) => void) => {
    const { over } = event;
    if (!over || !activeTask) {
      setOverColumnId(null);
      return;
    }

    const overId = over.id as string;
    
    // Check if over a column
    const column = columns.find(c => c.id === overId);
    if (column) {
      setOverColumnId(column.id);
      return;
    }

    // Check if over a task
    const overTask = tasks.find(t => t.id === overId);
    if (overTask) {
      setOverColumnId(overTask.columnId);
    }
  }, [columns, tasks]);

  const handleDragEnd = useCallback(async (
    event: DragEndEvent,
    activeTask: Task | null,
    setActiveTask: (task: Task | null) => void,
    setOverColumnId: (id: string | null) => void
  ) => {
    const { active, over } = event;
    
    setActiveTask(null);
    setOverColumnId(null);

    if (!over || !activeTask) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    // Find target column
    let targetColumnId: string;
    let insertIndex: number;

    const overColumn = columns.find(c => c.id === overId);
    if (overColumn) {
      // Dropped on a column
      targetColumnId = overColumn.id;
      const columnTasks = tasks.filter(t => t.columnId === targetColumnId && t.id !== activeId);
      insertIndex = columnTasks.length;
    } else {
      // Dropped on a task
      const overTask = tasks.find(t => t.id === overId);
      if (!overTask) return;
      targetColumnId = overTask.columnId;
      insertIndex = overTask.order;
    }

    // Calculate new order
    const sameColumn = activeTask.columnId === targetColumnId;
    const columnTasks = tasks
      .filter(t => t.columnId === targetColumnId && t.id !== activeId)
      .sort((a, b) => a.order - b.order);

    const updates: Array<{ id: string; order: number; columnId?: string }> = [];

    // Reorder tasks in target column
    columnTasks.forEach((task, index) => {
      const newOrder = index >= insertIndex ? index + 1 : index;
      updates.push({ id: task.id, order: newOrder });
    });

    // Update the active task
    updates.push({
      id: activeId,
      order: insertIndex,
      columnId: targetColumnId,
    });

    // If moving within same column, adjust orders
    if (sameColumn) {
      const oldOrder = activeTask.order;
      columnTasks.forEach((task, index) => {
        let newOrder = index;
        if (index >= insertIndex) newOrder = index + 1;
        if (task.order > oldOrder && task.order <= insertIndex) newOrder = task.order - 1;
        if (task.order < oldOrder && task.order >= insertIndex) newOrder = task.order + 1;
        updates.push({ id: task.id, order: newOrder });
      });
    }

    await onReorder(updates);
  }, [columns, tasks, onReorder]);

  return {
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  };
}

export { DndContext, DragOverlay, closestCorners };
