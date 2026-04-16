import React, { useState, useEffect } from 'react';
import type { Task, Comment } from '../../types';
import { getComments, createComment, updateComment, deleteComment } from '../../services/api';
import './TaskModal.css';

interface TaskModalProps {
  task?: Task | null;
  columnId: string;
  onSave: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'order'>) => Promise<void>;
  onClose: () => void;
}

const CURRENT_USER_KEY = 'kanban_current_user';

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // Less than 1 minute
  if (diff < 60000) {
    return '刚刚';
  }
  // Less than 1 hour
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`;
  }
  // Less than 24 hours
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`;
  }
  // Less than 7 days
  if (diff < 604800000) {
    return `${Math.floor(diff / 86400000)}天前`;
  }

  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function TaskModal({ task, columnId, onSave, onClose }: TaskModalProps) {
  // Form state
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

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentLoading, setCommentLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [currentUser, setCurrentUser] = useState(() => {
    return localStorage.getItem(CURRENT_USER_KEY) || '';
  });
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Load task data
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
      // Set current user to task assignee if not set
      if (!currentUser && task.assignee) {
        setCurrentUser(task.assignee);
      }
    } else {
      setFormData(prev => ({ ...prev, columnId }));
    }
  }, [task, columnId, currentUser]);

  // Load comments
  useEffect(() => {
    if (task?.id) {
      loadComments();
    }
  }, [task?.id]);

  const loadComments = async () => {
    if (!task?.id) return;
    try {
      setCommentLoading(true);
      const data = await getComments(task.id);
      setComments(data);
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setCommentLoading(false);
    }
  };

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

  // Comment handlers
  const handleAddComment = async () => {
    if (!task?.id || !newComment.trim() || !currentUser.trim()) return;

    try {
      const comment = await createComment(task.id, {
        author: currentUser.trim(),
        content: newComment.trim(),
      });
      setComments(prev => [comment, ...prev]);
      setNewComment('');
      // Save current user to localStorage
      localStorage.setItem(CURRENT_USER_KEY, currentUser.trim());
    } catch (error) {
      console.error('Failed to add comment:', error);
      alert('添加评论失败，请重试');
    }
  };

  const handleEditComment = (comment: Comment) => {
    setEditingComment(comment.id);
    setEditContent(comment.content);
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!editContent.trim()) return;

    try {
      const updated = await updateComment(commentId, { content: editContent.trim() });
      setComments(prev =>
        prev.map(c => (c.id === commentId ? updated : c))
      );
      setEditingComment(null);
      setEditContent('');
    } catch (error) {
      console.error('Failed to update comment:', error);
      alert('更新评论失败，请重试');
    }
  };

  const handleCancelEdit = () => {
    setEditingComment(null);
    setEditContent('');
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('确定要删除这条评论吗？')) return;

    try {
      await deleteComment(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (error) {
      console.error('Failed to delete comment:', error);
      alert('删除评论失败，请重试');
    }
  };

  const isCommentAuthor = (comment: Comment) => {
    return comment.author === currentUser.trim();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content task-modal">
        <div className="modal-header">
          <h2>{task ? '编辑任务' : '新建任务'}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
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

          {/* Comments Section */}
          {task && (
            <div className="comments-section">
              <div className="comments-divider" />
              <h3 className="comments-title">💬 讨论 ({comments.length})</h3>

              {/* Comment Input */}
              <div className="comment-input-area">
                <div className="comment-author-input">
                  <label>您的名字</label>
                  <input
                    type="text"
                    value={currentUser}
                    onChange={e => setCurrentUser(e.target.value)}
                    placeholder="输入您的名字"
                    className="author-input"
                  />
                </div>
                <textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="输入评论，使用 @名字 提及他人..."
                  rows={3}
                  className="comment-input"
                />
                <button
                  type="button"
                  className="add-comment-btn"
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || !currentUser.trim()}
                >
                  发送评论
                </button>
              </div>

              {/* Comments List */}
              <div className="comments-list">
                {commentLoading ? (
                  <div className="comments-loading">加载评论中...</div>
                ) : comments.length === 0 ? (
                  <div className="comments-empty">暂无评论，开始讨论吧</div>
                ) : (
                  comments.map(comment => (
                    <div
                      key={comment.id}
                      className={`comment-item ${isCommentAuthor(comment) ? 'own' : ''}`}
                    >
                      <div className="comment-header">
                        <span className="comment-author">{comment.author}</span>
                        <span className="comment-time">
                          {formatDate(comment.createdAt)}
                          {comment.updatedAt !== comment.createdAt && ' (已编辑)'}
                        </span>
                      </div>

                      {editingComment === comment.id ? (
                        <div className="comment-edit-area">
                          <textarea
                            value={editContent}
                            onChange={e => setEditContent(e.target.value)}
                            rows={2}
                            className="comment-edit-input"
                            autoFocus
                          />
                          <div className="comment-edit-actions">
                            <button
                              type="button"
                              className="edit-save-btn"
                              onClick={() => handleSaveEdit(comment.id)}
                              disabled={!editContent.trim()}
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              className="edit-cancel-btn"
                              onClick={handleCancelEdit}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="comment-content">{comment.content}</div>
                          {isCommentAuthor(comment) && (
                            <div className="comment-actions">
                              <button
                                type="button"
                                className="comment-edit-btn"
                                onClick={() => handleEditComment(comment)}
                              >
                                编辑
                              </button>
                              <button
                                type="button"
                                className="comment-delete-btn"
                                onClick={() => handleDeleteComment(comment.id)}
                              >
                                删除
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
