import React, { useState, useEffect, useMemo } from 'react';
import type { MindMapNode, Task } from '../../types';
import { MINDMAP_COLORS } from '../../types';
import './MindMapModal.css';

interface MindMapModalProps {
  node: MindMapNode | null;
  nodes: MindMapNode[];
  tasks: Task[];
  doneColumnId?: string;
  onSave: (data: { title: string; note: string; color: string; taskId: string }) => Promise<void>;
  onClose: () => void;
}

export function MindMapModal({ node, nodes, tasks, doneColumnId, onSave, onClose }: MindMapModalProps) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [color, setColor] = useState<string>(MINDMAP_COLORS[0].value);
  const [taskId, setTaskId] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const linkedTaskIds = useMemo(() => {
    const set = new Set<string>();
    for (const n of nodes) {
      if (n.taskId && n.taskId !== node?.taskId) set.add(n.taskId);
    }
    return set;
  }, [nodes, node]);

  useEffect(() => {
    if (node) {
      setTitle(node.title || '');
      setNote(node.note || '');
      setColor(node.color || MINDMAP_COLORS[0].value);
      setTaskId(node.taskId || '');
    }
  }, [node]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrors({ title: '请输入节点标题' });
      return;
    }
    setLoading(true);
    try {
      await onSave({ title: title.trim(), note, color, taskId });
      onClose();
    } catch (error) {
      console.error('Failed to save mind map node:', error);
      const msg =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        '保存失败，请重试';
      setErrors(prev => ({ ...prev, form: msg }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content mindmap-modal">
        <div className="modal-header">
          <h2>{node ? '编辑节点' : '新建节点'}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>标题 *</label>
            <input
              type="text"
              value={title}
              onChange={e => { setTitle(e.target.value); if (errors.title) setErrors({}); }}
              placeholder="输入节点标题"
              autoFocus
            />
            {errors.title && <span className="error">{errors.title}</span>}
          </div>

          <div className="form-group">
            <label>备注说明</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="输入备注说明"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>颜色标记</label>
            <div className="color-picker">
              {MINDMAP_COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  className={`color-swatch ${color === c.value ? 'active' : ''}`}
                  style={{ background: c.value }}
                  title={c.label}
                  onClick={() => setColor(c.value)}
                />
              ))}
            </div>
          </div>

          {doneColumnId && (
            <div className="form-group">
              <label>关联任务</label>
              <select value={taskId} onChange={e => setTaskId(e.target.value)}>
                <option value="">不关联任务</option>
                {tasks
                  .filter(t => t.id === taskId || (t.columnId !== doneColumnId && !linkedTaskIds.has(t.id)))
                  .slice()
                  .sort((a, b) => a.title.localeCompare(b.title, 'zh'))
                  .map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
              </select>
            </div>
          )}

          {errors.form && <span className="error form-error">{errors.form}</span>}

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>取消</button>
            <button type="submit" className="save-btn" disabled={loading}>
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}