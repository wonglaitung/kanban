import React, { useState, useEffect } from 'react';
import type { Task } from '../../types';
import './TaskModal.css';

interface TaskModalProps {
  task?: Task | null;
  columnId: string;
  onSave: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'order'>) => Promise<void>;
  onClose: () => void;
}

export function TaskModal({ task, columnId, onSave, onClose }: TaskModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assignee: '',
    priority: 'medium' as Task['priority'],
    dueDate: '',
    tags: [] as string[],
    progress: 0,
    progressText: '',
    columnId,
  });
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title || '',
        description: task.description || '',
        assignee: task.assignee || '',
        priority: task.priority || 'medium',
        dueDate: task.dueDate || '',
        tags: task.tags || [],
        progress: task.progress || 0,
        progressText: task.progressText || '',
        columnId: task.columnId,
      });
    } else {
      setFormData(prev => ({ ...prev, columnId }));
    }
  }, [task, columnId]);

  const handleChange = (field: string, value: string | number | Task['priority']) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()],
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag),
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.title.trim()) {
      newErrors.title = '请输入任务标题';
    }
    if (!formData.assignee.trim()) {
      newErrors.assignee = '请输入负责人';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Failed to save task:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content task-modal">
        <div className="modal-header">
          <h2>{task ? '编辑任务' : '新建任务'}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>标题 *</label>
            <input
              type="text"
              value={formData.title}
              onChange={e => handleChange('title', e.target.value)}
              placeholder="输入任务标题"
              autoFocus
            />
            {errors.title && <span className="error">{errors.title}</span>}
          </div>

          <div className="form-group">
            <label>描述</label>
            <textarea
              value={formData.description}
              onChange={e => handleChange('description', e.target.value)}
              placeholder="输入任务描述"
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>负责人 *</label>
              <input
                type="text"
                value={formData.assignee}
                onChange={e => handleChange('assignee', e.target.value)}
                placeholder="输入负责人姓名"
              />
              {errors.assignee && <span className="error">{errors.assignee}</span>}
            </div>

            <div className="form-group">
              <label>优先级</label>
              <select
                value={formData.priority}
                onChange={e => handleChange('priority', e.target.value as Task['priority'])}
              >
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>截止日期</label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={e => handleChange('dueDate', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>标签</label>
            <div className="tags-input">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入标签后按回车添加"
              />
              <button type="button" className="add-tag-btn" onClick={handleAddTag}>
                添加
              </button>
            </div>
            <div className="tags-list">
              {formData.tags.map(tag => (
                <span key={tag} className="tag-item">
                  {tag}
                  <button type="button" onClick={() => handleRemoveTag(tag)}>×</button>
                </span>
              ))}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>进度百分比</label>
              <div className="progress-input-container">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.progress}
                  onChange={e => handleChange('progress', parseInt(e.target.value) || 0)}
                  className="progress-number"
                  placeholder="0-100"
                />
                <span className="progress-unit">%</span>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>进度说明</label>
            <textarea
              value={formData.progressText}
              onChange={e => handleChange('progressText', e.target.value)}
              placeholder="例如：已完成前端开发，等待后端接口"
              rows={3}
            />
          </div>

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="save-btn" disabled={loading}>
              {loading ? '保存中...' : (task ? '保存' : '创建')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
