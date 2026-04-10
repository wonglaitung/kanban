import { useState, useEffect } from 'react';
import './PasswordModal.css';

interface PasswordModalProps {
  isSetup: boolean;
  storedPassword: string;
  onSuccess: (password: string) => void;
  onSetPassword: (password: string) => Promise<void>;
  onClose?: () => void;
}

export function PasswordModal({ isSetup, storedPassword, onSuccess, onSetPassword, onClose }: PasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If no password is set yet, show setup mode
    if (isSetup && !storedPassword) {
      return;
    }
  }, [isSetup, storedPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password.trim()) {
      setError('请输入密码');
      return;
    }

    setLoading(true);
    try {
      if (isSetup && !storedPassword) {
        // Setup new password
        if (!confirmPassword.trim()) {
          setError('请确认密码');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('两次输入的密码不一致');
          setLoading(false);
          return;
        }
        await onSetPassword(password);
        onSuccess(password);
      } else {
        // Verify password
        if (password === storedPassword) {
          onSuccess(password);
        } else {
          setError('密码错误');
        }
      }
    } catch (err) {
      setError('操作失败，请重试');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isSetupMode = isSetup && !storedPassword;

  return (
    <div className="modal-overlay password-overlay">
      <div className="modal-content password-modal" onClick={e => e.stopPropagation()}>
        {onClose && (
          <button className="modal-close-btn" onClick={onClose} title="关闭">
            ×
          </button>
        )}
        <div className="password-icon">
          {isSetupMode ? '🔐' : '🔓'}
        </div>
        <h2>{isSetupMode ? '设置密码' : '请输入密码'}</h2>
        <p className="password-hint">
          {isSetupMode
            ? '设置一个密码来保护您的看板数据'
            : '请输入密码以访问看板'}
        </p>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="password"
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                setError('');
              }}
              placeholder="输入密码"
              autoFocus
            />
          </div>

          {isSetupMode && (
            <div className="form-group">
              <input
                type="password"
                value={confirmPassword}
                onChange={e => {
                  setConfirmPassword(e.target.value);
                  setError('');
                }}
                placeholder="确认密码"
              />
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? '处理中...' : (isSetupMode ? '设置密码' : '解锁')}
          </button>
        </form>
      </div>
    </div>
  );
}
