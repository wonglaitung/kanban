import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { MindMapNode as MindMapNodeType, Task } from '../../types';
import { PRIORITY_LABELS } from '../../types';
import './MindMapNode.css';

interface MindMapNodeProps {
  node: MindMapNodeType;
  nodes: MindMapNodeType[];
  tasks: Task[];
  branchColor: string;
  collapsed: Set<string>;
  draggingId: string | null;
  invalidIds: Set<string>;
  dropTarget: DropTarget | null;
  doneColumnId?: string;
  onToggleCollapse: (id: string) => void;
  onAddChild: (id: string) => void;
  onEdit: (node: MindMapNodeType) => void;
  onDelete: (node: MindMapNodeType) => void;
  onToggleDone: (id: string, done: boolean) => void;
  onOpenTask: (taskId: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOverNode: (id: string, zone: DropZone, clientY: number) => void;
  onDropNode: (targetId: string, zone: DropZone) => void;
}

type DropZone = 'blocked' | 'child' | 'insert';

export type DropTarget =
  | { id: string; zone: 'blocked' }
  | { id: string; zone: 'child' }
  | { id: string; zone: 'insert'; parentId: string | null; index: number; lineX: number; lineY: number; lineW: number };

const DROP_BAND = 10;

function resolveDropZone(rect: DOMRect, x: number, y: number, isInvalid: boolean): DropZone {
  if (isInvalid) return 'blocked';
  if (y >= DROP_BAND && y <= rect.height - DROP_BAND && x >= rect.width * 0.5) return 'child';
  return 'insert';
}

export function MindMapNode({
  node,
  nodes,
  tasks,
  branchColor,
  collapsed,
  draggingId,
  invalidIds,
  dropTarget,
  doneColumnId,
  onToggleCollapse,
  onAddChild,
  onEdit,
  onDelete,
  onToggleDone,
  onOpenTask,
  onDragStart,
  onDragEnd,
  onDragOverNode,
  onDropNode,
}: MindMapNodeProps) {
  const linkedTask = node.taskId ? tasks.find(t => t.id === node.taskId) : null;
  const isRoot = !node.parentId;
  const isTaskDone = !!(linkedTask && doneColumnId && linkedTask.columnId === doneColumnId);
  const isDone = !!node.done || isTaskDone;
  const isDropTarget = dropTarget?.id === node.id;
  const isInvalid = invalidIds.has(node.id);
  const isBlocked = isDropTarget && dropTarget!.zone === 'blocked';
  const isChildTarget = isDropTarget && dropTarget!.zone === 'child';
  const children = nodes
    .filter(n => n.parentId === node.id)
    .sort((a, b) => a.order - b.order);
  const isCollapsed = collapsed.has(node.id);

  const noteRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [noteOverflow, setNoteOverflow] = useState(false);
  useEffect(() => {
    const el = noteRef.current;
    if (el && node.note) {
      // clamped（2 行）状态下 clientHeight 为截断高度，scrollHeight 为全文高度；溢出则显示切换按钮
      setNoteOverflow(el.scrollHeight > el.clientHeight + 1);
    } else {
      setNoteOverflow(false);
    }
  }, [node.note]);

  const handleDragOver = (e: React.DragEvent) => {
    if (!isInvalid) {
      e.preventDefault();
    }
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const zone = resolveDropZone(rect, x, y, isInvalid);
    onDragOverNode(node.id, zone, e.clientY);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const zone = resolveDropZone(rect, x, y, isInvalid);
    onDropNode(node.id, zone);
  };

  return (
    <div className={`mm-node ${isRoot ? 'root' : ''}`} style={{ '--branch-color': branchColor } as CSSProperties}>
      <div
        className="mm-node-drop"
        data-node-id={node.id}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div
          className={`mm-node-card ${draggingId === node.id ? 'dragging' : ''} ${linkedTask ? 'has-task' : ''} ${isDone ? 'done' : ''} ${isInvalid ? 'invalid' : ''} ${isBlocked ? 'drag-over-blocked' : ''} ${isChildTarget ? 'drag-over-child' : ''}`}
          style={{ borderLeftColor: node.color || undefined }}
          draggable
          onDragStart={e => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', node.id);
            onDragStart(node.id);
          }}
          onDragEnd={onDragEnd}
        >
          <div className="mm-node-header">
            {children.length > 0 ? (
              <button
                className={`mm-collapse-btn ${isCollapsed ? 'collapsed' : ''}`}
                onClick={() => onToggleCollapse(node.id)}
                title={isCollapsed ? '展开' : '折叠'}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            ) : (
              <span className="mm-collapse-placeholder" />
            )}
            <span className="mm-node-title">{node.title}</span>
            {isDone && (
              <span className="mm-done-badge" title={isTaskDone ? '任务已完成' : '手工标记'}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            )}
            <div className="mm-node-actions">
              <button
                className="mm-action-btn"
                onClick={e => { e.stopPropagation(); onAddChild(node.id); }}
                title="添加子节点"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <button
                className="mm-action-btn"
                onClick={e => { e.stopPropagation(); onEdit(node); }}
                title="编辑节点"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
              </button>
              <button
                className="mm-action-btn done-toggle"
                disabled={isTaskDone}
                onClick={e => { e.stopPropagation(); onToggleDone(node.id, !node.done); }}
                title={isTaskDone ? '由关联任务状态决定，请在看板移动任务' : node.done ? '取消完成标记' : '标记完成'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
              <button
                className="mm-action-btn delete"
                onClick={e => { e.stopPropagation(); onDelete(node); }}
                title="删除节点"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {!isDone && node.note && (
            <>
              <div
                ref={noteRef}
                className={`mm-node-note${expanded ? '' : ' clamped'}`}
              >
                {node.note}
              </div>
              {noteOverflow && (
                <button
                  type="button"
                  className="mm-note-toggle"
                  onClick={() => setExpanded(v => !v)}
                >
                  {expanded ? '收起' : '展开'}
                </button>
              )}
            </>
          )}

          {linkedTask && !isDone && (
            <div className="mm-task-summary">
              <button
                className="mm-task-link"
                onClick={e => { e.stopPropagation(); onOpenTask(linkedTask.id); }}
                title="打开关联任务"
              >
                {linkedTask.title}
              </button>
              <div className="mm-task-meta">
                <span className="mm-task-progress">{linkedTask.progress || 0}%</span>
                <span className="mm-task-assignee">{linkedTask.assignee || '未指派'}</span>
                {linkedTask.priority && (
                  <span className={`mm-task-priority ${linkedTask.priority}`}>
                    {PRIORITY_LABELS[linkedTask.priority]}
                  </span>
                )}
              </div>
            </div>
          )}

          {isDropTarget && dropTarget!.zone !== 'insert' && (
            <div className={`mm-drop-indicator ${dropTarget!.zone}`} />
          )}
        </div>
      </div>

      {children.length > 0 && !isCollapsed && (
        <div className="mm-node-children">
          {children.map(child => (
            <MindMapNode
              key={child.id}
              node={child}
              nodes={nodes}
              tasks={tasks}
              branchColor={branchColor}
              collapsed={collapsed}
              draggingId={draggingId}
              invalidIds={invalidIds}
              dropTarget={dropTarget}
              doneColumnId={doneColumnId}
              onToggleCollapse={onToggleCollapse}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleDone={onToggleDone}
              onOpenTask={onOpenTask}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOverNode={onDragOverNode}
              onDropNode={onDropNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}