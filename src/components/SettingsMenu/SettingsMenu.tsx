import { useState, useRef, useEffect } from 'react';
import type { Theme } from '../../types';
import './SettingsMenu.css';

interface ThemeOption {
  value: Theme;
  label: string;
  icon: string;
}

const themeOptions: ThemeOption[] = [
  { value: 'dark-neon', label: '霓虹暗色', icon: '🌌' },
  { value: 'light', label: '明亮模式', icon: '☀️' },
  { value: 'dark', label: '简洁暗色', icon: '🌙' },
];

interface SettingsMenuProps {
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
  onChangeToken: () => void;
}

export function SettingsMenu({ currentTheme, onThemeChange, onChangeToken }: SettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleThemeSelect = (theme: Theme) => {
    onThemeChange(theme);
  };

  return (
    <div className="settings-menu" ref={dropdownRef}>
      <button
        className="settings-menu-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="设置"
      >
        <span className="settings-icon">⚙️</span>
        <span className="settings-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="settings-dropdown">
          <div className="settings-dropdown-header">主题</div>
          {themeOptions.map((option) => (
            <button
              key={option.value}
              className={`settings-option ${currentTheme === option.value ? 'active' : ''}`}
              onClick={() => handleThemeSelect(option.value)}
            >
              <span className="settings-option-icon">{option.icon}</span>
              <span className="settings-option-label">{option.label}</span>
              {currentTheme === option.value && (
                <span className="settings-check">✓</span>
              )}
            </button>
          ))}
          <div className="settings-divider" />
          <button
            className="settings-option"
            onClick={() => {
              setIsOpen(false);
              onChangeToken();
            }}
          >
            <span className="settings-option-icon">🔐</span>
            <span className="settings-option-label">修改令牌</span>
          </button>
        </div>
      )}
    </div>
  );
}
