import { useState, useCallback, useMemo } from 'react';
import type { MindMapNode as MindMapNodeType, Task } from '../../types';
import { useMindMap } from '../../hooks/useMindMap';
import { MindMapNode, type DropTarget } from './MindMapNode';
import { MindMapModal } from './MindMapModal';
import { ConfirmDialog } from '../ConfirmDialog';
import './MindMap.css';

/** 根节点分支色板（暗色背景高区分度，与主题无关）；按根节点出现顺序分配，超出循环复用。 */
const BRANCH_PALETTE = [
  '#5AA9E6', // 蓝
  '#F6AD55', // 橙
  '#68D391', // 绿
  '#B794F4', // 紫
  '#FC8181', // 红
  '#4FD1C5', // 青
  '#F687B3', // 粉
  '#ECC94B', // 黄
];

interface MindMapProps {
  tasks: Task[];
  doneColumnId?: string;
  onOpenTask: (taskId: string) => void;
}

export function MindMap({ tasks, doneColumnId, onOpenTask }: MindMapProps) {
  const { nodes, loading, rootNodes, addNode, editNode, removeNode, moveNode } = useMindMap();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [modalState, setModalState] = useState<{ node: MindMapNodeType | null; parentId: string } | null>(null);
  const [deleteNode, setDeleteNode] = useState<MindMapNodeType | null>(null);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleAddRoot = useCallback(() => {
    setModalState({ node: null, parentId: '' });
  }, []);

  const handleAddChild = useCallback((parentId: string) => {
    setModalState({ node: null, parentId });
  }, []);

  const handleSave = useCallback(
    async (data: { title: string; note: string; color: string; taskId: string }) => {
      if (modalState?.node) {
        await editNode(modalState.node.id, data);
      } else {
        await addNode({ ...data, parentId: modalState?.parentId });
      }
    },
    [modalState, addNode, editNode]
  );

  const handleDelete = useCallback(async () => {
    if (deleteNode) {
      await removeNode(deleteNode.id);
    }
    setDeleteNode(null);
  }, [deleteNode, removeNode]);

  // --- Drag & Drop ---
  const handleDragStart = useCallback((id: string) => {
    setDraggingId(id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTarget(null);
  }, []);

  // 拖拽源节点的整棵子树为无效落点，用于高亮提示
  const invalidIds = useMemo(() => {
    const set = new Set<string>();
    if (!draggingId) return set;
    const collect = (id: string) => {
      set.add(id);
      nodes.filter(n => n.parentId === id).forEach(n => collect(n.id));
    };
    collect(draggingId);
    return set;
  }, [draggingId, nodes]);

  const handleDragOverNode = useCallback((id: string, zone: 'blocked' | 'child' | 'insert', clientY: number) => {
    if (zone === 'blocked') {
      setDropTarget(prev => (prev && prev.id === id && prev.zone === 'blocked' ? prev : { id, zone: 'blocked' }));
      return;
    }
    if (zone === 'child') {
      setDropTarget(prev => (prev && prev.id === id && prev.zone === 'child' ? prev : { id, zone: 'child' }));
      if (draggingId && draggingId !== id && collapsed.has(id)) {
        toggleCollapse(id);
      }
      return;
    }
    // insert: 在同一父节点下按光标 Y 计算插入线位置
    const target = nodes.find(n => n.id === id);
    if (!target) return;
    const parentId = target.parentId || '';
    const siblings = nodes
      .filter(n => (n.parentId || '') === parentId)
      .sort((a, b) => a.order - b.order);

    const cardRects = siblings.map(s => {
      const el = document.querySelector<HTMLElement>(`.mm-node-drop[data-node-id="${s.id}"] .mm-node-card`);
      return el ? el.getBoundingClientRect() : null;
    });

    let index = siblings.length;
    for (let i = 0; i < siblings.length; i++) {
      const r = cardRects[i];
      if (!r) continue;
      if (clientY < r.top + r.height / 2) {
        index = i;
        break;
      }
    }

    const first = cardRects.find(Boolean);
    if (!first) return;
    let lineY: number;
    if (index === 0) {
      lineY = first.top - 5;
    } else if (index >= siblings.length) {
      lineY = (cardRects[siblings.length - 1]?.bottom ?? first.bottom) + 5;
    } else {
      const above = cardRects[index - 1];
      const below = cardRects[index];
      lineY = (above!.bottom + below!.top) / 2;
    }
    const lineX = first.left;
    const lineW = first.width;

    const treeEl = document.querySelector<HTMLElement>('.mindmap-tree');
    const treeRect = treeEl?.getBoundingClientRect();
    if (!treeRect) return;

    const targetDt: DropTarget = {
      id,
      zone: 'insert',
      parentId: parentId || null,
      index,
      lineX: lineX - treeRect.left,
      lineY: lineY - treeRect.top,
      lineW,
    };
    setDropTarget(prev => {
      if (prev && prev.zone === 'insert' && prev.id === id && prev.index === index) return prev;
      return targetDt;
    });
  }, [collapsed, draggingId, nodes, toggleCollapse]);

  const isDescendant = useCallback(
    (candidate: string, ancestorId: string): boolean => {
      let current: MindMapNodeType | undefined = nodes.find(n => n.id === candidate);
      while (current && current.parentId) {
        if (current.parentId === ancestorId) return true;
        current = nodes.find(n => n.id === current!.parentId);
      }
      return false;
    },
    [nodes]
  );

  const handleDropNode = useCallback(
    async (targetId: string, zone: 'blocked' | 'child' | 'insert') => {
      const dragId = draggingId;
      const lastDropTarget = dropTarget;
      setDraggingId(null);
      setDropTarget(null);
      if (!dragId || dragId === targetId) return;
      if (zone === 'blocked') return;

      // Prevent dropping into own subtree
      if (isDescendant(dragId, targetId)) return;

      const dragged = nodes.find(n => n.id === dragId);
      if (!dragged) return;

      let newParentId: string;
      let insertIndex: number;
      let siblings: MindMapNodeType[];

      if (zone === 'child') {
        newParentId = targetId;
        siblings = nodes
          .filter(n => n.parentId === targetId && n.id !== dragId)
          .sort((a, b) => a.order - b.order);
        insertIndex = siblings.length;
      } else if (zone === 'insert' && lastDropTarget?.zone === 'insert') {
        newParentId = lastDropTarget.parentId || '';
        siblings = nodes
          .filter(n => (n.parentId || '') === newParentId && n.id !== dragId)
          .sort((a, b) => a.order - b.order);
        insertIndex = Math.max(0, Math.min(siblings.length, lastDropTarget.index));
      } else {
        return;
      }

      // Avoid reparenting when no change
      if ((dragged.parentId || '') === newParentId) {
        const currentSiblings = nodes
          .filter(n => (n.parentId || '') === newParentId)
          .sort((a, b) => a.order - b.order);
        const currentIdx = currentSiblings.findIndex(n => n.id === dragId);
        if (currentIdx === insertIndex || currentIdx === insertIndex - 1) {
          return;
        }
      }

      // Build updates: renumber target sibling group
      siblings.splice(insertIndex, 0, dragged);
      const updates = siblings.map((n, i) => ({
        id: n.id,
        parentId: newParentId || undefined,
        order: i,
      }));
      await moveNode(updates);
    },
    [draggingId, nodes, isDescendant, moveNode, dropTarget]
  );

  const handleDropCanvas = useCallback(async () => {
    const dragId = draggingId;
    setDraggingId(null);
    setDropTarget(null);
    if (!dragId) return;

    const dragged = nodes.find(n => n.id === dragId);
    if (!dragged || !dragged.parentId) return; // already root

    const siblings = nodes
      .filter(n => !n.parentId && n.id !== dragId)
      .sort((a, b) => a.order - b.order);
    const updates = siblings.map((n, i) => ({ id: n.id, parentId: undefined, order: i }));
    updates.push({ id: dragId, parentId: undefined, order: siblings.length });
    await moveNode(updates);
  }, [draggingId, nodes, moveNode]);

  const roots = rootNodes();

  return (
    <div className="mindmap">
      <div
        className="mindmap-canvas"
        onDragOver={e => { e.preventDefault(); }}
        onDrop={handleDropCanvas}
      >
        {loading ? (
          <div className="mindmap-loading">
            <div className="loading-spinner" />
            <p>加载中...</p>
          </div>
        ) : roots.length === 0 ? (
          <div className="mindmap-empty">
            <p>还没有工作主线，添加一个根节点开始规划</p>
            <button className="mindmap-add-root-btn" onClick={handleAddRoot}>添加根节点</button>
          </div>
        ) : (
          <div className="mindmap-tree">
            {roots.map((root, index) => (
              <MindMapNode
                key={root.id}
                node={root}
                nodes={nodes}
                tasks={tasks}
                branchColor={BRANCH_PALETTE[index % BRANCH_PALETTE.length]}
                collapsed={collapsed}
                draggingId={draggingId}
                invalidIds={invalidIds}
                dropTarget={dropTarget}
                onToggleCollapse={toggleCollapse}
                onAddChild={handleAddChild}
                onEdit={node => setModalState({ node, parentId: node.parentId })}
                onDelete={setDeleteNode}
                onOpenTask={onOpenTask}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOverNode={handleDragOverNode}
                onDropNode={handleDropNode}
              />
            ))}
            {dropTarget?.zone === 'insert' && (
              <div
                className="mm-insert-line"
                style={{ left: dropTarget.lineX, top: dropTarget.lineY, width: dropTarget.lineW }}
              />
            )}
          </div>
        )}
      </div>

      {roots.length > 0 && (
        <button className="mindmap-fab" onClick={handleAddRoot} title="添加根节点" aria-label="添加根节点">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      {modalState && (
        <MindMapModal
          node={modalState.node}
          nodes={nodes}
          tasks={tasks}
          doneColumnId={doneColumnId}
          onSave={handleSave}
          onClose={() => setModalState(null)}
        />
      )}

      {deleteNode && (
        <ConfirmDialog
          title="删除节点"
          message={`确定要删除节点「${deleteNode.title}」吗？其所有子节点将一并删除，此操作无法撤销。`}
          confirmText="删除"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteNode(null)}
        />
      )}
    </div>
  );
}