import { useState, useEffect } from 'react';
import './TokenModal.css';

interface TokenModalProps {
  isSetup: boolean;
  storedToken: string;
  onSuccess: (token: string) => void;
  onSetToken: (token: string) => Promise<void>;
  onClose?: () => void;
}

export function TokenModal({ isSetup, storedToken, onSuccess, onSetToken, onClose }: TokenModalProps) {
  const [token, setToken] = useState('');
  const [confirmToken, setConfirmToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If no token is set yet, show setup mode
    if (isSetup && !storedToken) {
      return;
    }
  }, [isSetup, storedToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token.trim()) {
      setError('请输入令牌');
      return;
    }

    setLoading(true);
    try {
      if (isSetup && !storedToken) {
        // Setup new token
        if (!confirmToken.trim()) {
          setError('请确认令牌');
          setLoading(false);
          return;
        }
        if (token !== confirmToken) {
          setError('两次输入的令牌不一致');
          setLoading(false);
          return;
        }
        await onSetToken(token);
        onSuccess(token);
      } else {
        // Verify token
        if (token === storedToken) {
          onSuccess(token);
        } else {
          setError('令牌错误');
        }
      }
    } catch (err) {
      setError('操作失败，请重试');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isSetupMode = isSetup && !storedToken;

  return (
    <div className="modal-overlay token-overlay">
      <div className="modal-content token-modal" onClick={e => e.stopPropagation()}>
        {onClose && (
          <button className="modal-close-btn" onClick={onClose} title="关闭">
            ×
          </button>
        )}
        <div className="token-icon">
          {isSetupMode ? '🔐' : '🔓'}
        </div>
        <h2>{isSetupMode ? '设置令牌' : '请输入令牌'}</h2>
        <p className="token-hint">
          {isSetupMode
            ? '设置一个令牌来保护您的看板数据'
            : '请输入令牌以访问看板'}
        </p>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="password"
              value={token}
              onChange={e => {
                setToken(e.target.value);
                setError('');
              }}
              placeholder="输入令牌"
              autoFocus
            />
          </div>

          {isSetupMode && (
            <div className="form-group">
              <input
                type="password"
                value={confirmToken}
                onChange={e => {
                  setConfirmToken(e.target.value);
                  setError('');
                }}
                placeholder="确认令牌"
              />
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? '处理中...' : (isSetupMode ? '设置令牌' : '解锁')}
          </button>
        </form>
      </div>
    </div>
  );
}