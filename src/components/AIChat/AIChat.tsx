import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chat } from '../../services/aiApi';
import './AIChat.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIChatProps {
  onClose?: () => void;
  onNavigate?: (page: string, params?: Record<string, unknown>) => void;
}

export default function AIChat({ onClose, onNavigate }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '你好！我是你的数字分身。我可以帮你分析任务、查询数据、提供建议。有什么我可以帮你的吗？',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [sessionId] = useState(`session-${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 检测是否需要显示滚动按钮
  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollBtn(!isNearBottom);
    }
  };

  // 新消息时自动滚动
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 发送消息
  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await chat(userMessage.content, sessionId);

      // 检测导航指令
      if (response.navigate && onNavigate) {
        onNavigate(response.navigate.page, response.navigate);
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `抱歉，发生了错误: ${error instanceof Error ? error.message : '未知错误'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 清空对话
  const handleClear = () => {
    setMessages([
      {
        id: 'welcome-new',
        role: 'assistant',
        content: '对话已清空。有什么新问题吗？',
        timestamp: new Date(),
      },
    ]);
  };

  // 快捷问题
  const quickQuestions = [
    '有哪些高优先级任务？',
    '新增"完成用户登录功能" 任务',
    '查看"用户登录"这个任务',
    '生成任务报告',
  ];

  return (
    <div className="ai-chat-container">
      <div className="ai-chat-header">
        <h3>
          <img src="/icon.svg" alt="AI" width="24" height="28" style={{ marginRight: '8px' }} />
          <span>数字分身</span>
        </h3>
        <div className="ai-chat-header-actions">
          <button
            className="ai-chat-header-btn"
            onClick={handleClear}
            title="清空对话"
          >
            🗑️
          </button>
          {onClose && (
            <button className="ai-chat-close" onClick={onClose}>
              ✕
            </button>
          )}
        </div>
      </div>

      <div
        className="ai-chat-messages"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`ai-chat-message ai-chat-message-${msg.role}`}>
            <div className="ai-chat-message-content">
              {msg.role === 'assistant' ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
            <div className="ai-chat-message-time">
              {msg.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}
        {loading && (
          <div className="ai-chat-message ai-chat-message-assistant">
            <div className="ai-chat-message-content ai-chat-loading">
              <span className="ai-chat-loading-dot"></span>
              <span className="ai-chat-loading-dot"></span>
              <span className="ai-chat-loading-dot"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 滚动到底部按钮 */}
      {showScrollBtn && (
        <button className="ai-chat-scroll-btn" onClick={scrollToBottom}>
          ↓
        </button>
      )}

      {/* 快捷问题 */}
      <div className="ai-chat-quick-questions">
        {quickQuestions.map((q, i) => (
          <button
            key={i}
            className="ai-chat-quick-btn"
            onClick={() => setInput(q)}
          >
            {q}
          </button>
        ))}
      </div>

      <div className="ai-chat-input">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入问题..."
          rows={2}
          disabled={loading}
        />
        <button
          className="ai-chat-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || loading}
        >
          发送
        </button>
      </div>
    </div>
  );
}
