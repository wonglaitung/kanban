import { useState, useEffect, useCallback } from 'react';
import type { MindMapNode } from '../types';
import {
  getMindMapNodes,
  createMindMapNode,
  updateMindMapNode,
  deleteMindMapNode as deleteMindMapNodeApi,
  batchUpdateMindMapNodes,
} from '../services/api';

export function useMindMap() {
  const [nodes, setNodes] = useState<MindMapNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNodes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getMindMapNodes();
      setNodes(data);
      setError(null);
    } catch (err) {
      setError('获取思维导图失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  const childrenOf = useCallback(
    (parentId: string) =>
      nodes
        .filter(n => (n.parentId || null) === (parentId || null))
        .sort((a, b) => a.order - b.order),
    [nodes]
  );

  const rootNodes = useCallback(() => childrenOf(''), [childrenOf]);

  const addNode = useCallback(
    async (data: { title: string; note?: string; color?: string; taskId?: string; parentId?: string }) => {
      try {
        const newNodes = await createMindMapNode(data);
        setNodes(prev =>
          prev.some(n => n.id === newNodes.id) ? prev : [...prev, newNodes]
        );
        return newNodes;
      } catch (err) {
        setError('添加导图节点失败');
        console.error(err);
        throw err;
      }
    },
    []
  );

  const editNode = useCallback(async (id: string, updates: Partial<MindMapNode>) => {
    try {
      const updated = await updateMindMapNode(id, updates);
      setNodes(prev => prev.map(n => (n.id === id ? updated : n)));
      return updated;
    } catch (err) {
      setError('更新导图节点失败');
      console.error(err);
      throw err;
    }
  }, []);

  const removeNode = useCallback(
    async (id: string) => {
      try {
        await deleteMindMapNodeApi(id);
        // Collect the deleted node and all its descendants
        const deletedIds = new Set<string>();
        const collect = (nodeId: string) => {
          deletedIds.add(nodeId);
          nodes.forEach(n => {
            if (n.parentId === nodeId) collect(n.id);
          });
        };
        collect(id);
        setNodes(prev => prev.filter(n => !deletedIds.has(n.id)));
      } catch (err) {
        setError('删除导图节点失败');
        console.error(err);
        throw err;
      }
    },
    [nodes]
  );

  const moveNode = useCallback(
    async (updates: Array<{ id: string; parentId?: string; order?: number }>) => {
      try {
        const allNodes = await batchUpdateMindMapNodes(updates);
        setNodes(allNodes);
      } catch (err) {
        setError('调整导图节点失败');
        console.error(err);
        throw err;
      }
    },
    []
  );

  return {
    nodes,
    loading,
    error,
    childrenOf,
    rootNodes,
    addNode,
    editNode,
    removeNode,
    moveNode,
    refresh: fetchNodes,
  };
}