import React, { useState } from 'react';
import './AnnouncementModal.css';

interface AnnouncementModalProps {
  announcement: string;
  onSave: (announcement: string) => Promise<void>;
  onClose: () => void;
}

export function AnnouncementModal({ announcement, onSave, onClose }: AnnouncementModalProps) {
  const [content, setContent] = useState(announcement || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    try {
      await onSave(content.trim());
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
      <div className="modal-content announcement-modal">
        <div className="modal-header">
          <h2>编辑公告</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>工作重点</label>
            <textarea
              value={content}
              onChange={e => {
                setContent(e.target.value);
                setError('');
              }}
              placeholder="输入当前工作重点，留空则不显示公告"
              rows={4}
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
