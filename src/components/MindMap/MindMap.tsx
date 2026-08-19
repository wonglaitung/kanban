import { useState, useCallback } from 'react';
import type { MindMapNode as MindMapNodeType, Task } from '../../types';
import { useMindMap } from '../../hooks/useMindMap';
import { MindMapNode } from './MindMapNode';
import { MindMapModal } from './MindMapModal';
import { ConfirmDialog } from '../ConfirmDialog';
import './MindMap.css';

interface MindMapProps {
  tasks: Task[];
  onOpenTask: (taskId: string) => void;
}

type DropPosition = 'before' | 'after' | 'child';

export function MindMap({ tasks, onOpenTask }: MindMapProps) {
  const { nodes, loading, rootNodes, addNode, editNode, removeNode, moveNode } = useMindMap();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);
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

  const handleDragOverNode = useCallback((id: string, position: DropPosition) => {
    setDropTarget(prev => (prev && prev.id === id && prev.position === position ? prev : { id, position }));
  }, []);

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
    async (targetId: string, position: DropPosition) => {
      const dragId = draggingId;
      setDraggingId(null);
      setDropTarget(null);
      if (!dragId || dragId === targetId) return;

      // Prevent dropping into own subtree
      if (isDescendant(dragId, targetId)) return;

      const dragged = nodes.find(n => n.id === dragId);
      const target = nodes.find(n => n.id === targetId);
      if (!dragged || !target) return;

      let newParentId: string;
      let insertIndex: number;
      let siblings: MindMapNodeType[];

      if (position === 'child') {
        newParentId = targetId;
        siblings = nodes
          .filter(n => n.parentId === targetId && n.id !== dragId)
          .sort((a, b) => a.order - b.order);
        insertIndex = siblings.length;
      } else {
        // before/after → same parent as target, positioned relative to target
        newParentId = target.parentId || '';
        siblings = nodes
          .filter(n => (n.parentId || '') === newParentId && n.id !== dragId)
          .sort((a, b) => a.order - b.order);
        const targetIdx = siblings.findIndex(n => n.id === targetId);
        insertIndex = position === 'before' ? Math.max(0, targetIdx) : Math.min(siblings.length, targetIdx + 1);
      }

      // Avoid reparenting when no change
      if ((dragged.parentId || '') === newParentId) {
        const currentSiblings = nodes
          .filter(n => (n.parentId || '') === newParentId)
          .sort((a, b) => a.order - b.order);
        const currentIdx = currentSiblings.findIndex(n => n.id === dragId);
        if (position !== 'child' && (currentIdx === insertIndex || currentIdx === insertIndex - 1)) {
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
    [draggingId, nodes, isDescendant, moveNode]
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
    <div
      className="mindmap-canvas"
      onDragOver={e => { e.preventDefault(); }}
      onDrop={handleDropCanvas}
    >
      <div className="mindmap-toolbar">
        <div className="mindmap-toolbar-left">
          <span className="mindmap-label">工作主线</span>
        </div>
        <div className="mindmap-toolbar-right">
          <button className="mindmap-add-root-btn" onClick={handleAddRoot}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            添加根节点
          </button>
        </div>
      </div>

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
          {roots.map(root => (
            <MindMapNode
              key={root.id}
              node={root}
              nodes={nodes}
              tasks={tasks}
              collapsed={collapsed}
              draggingId={draggingId}
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
        </div>
      )}

      {modalState && (
        <MindMapModal
          node={modalState.node}
          tasks={tasks}
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