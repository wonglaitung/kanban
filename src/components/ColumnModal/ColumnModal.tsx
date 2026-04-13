import React, { useState, useEffect } from 'react';
import type { Column } from '../../types';
import './ColumnModal.css';

interface ColumnModalProps {
  column?: Column | null;
  onSave: (title: string) => Promise<void>;
  onClose: () => void;
}

export function ColumnModal({ column, onSave, onClose }: ColumnModalProps) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (column) {
      setTitle(column.title);
    }
  }, [column]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError('请输入列名称');
      return;
    }

    setLoading(true);
    try {
      await onSave(title.trim());
      onClose();
    } catch (err) {
      setError('保存失败，请重试');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content column-modal">
        <div className="modal-header">
          <h2>{column ? '编辑列' : '新建列'}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>列名称 *</label>
            <input
              type="text"
              value={title}
              onChange={e => {
                setTitle(e.target.value);
                setError('');
              }}
              placeholder="输入列名称"
              autoFocus
            />
            {error && <span className="error">{error}</span>}
          </div>

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="save-btn" disabled={loading}>
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
