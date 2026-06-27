import { useState, useRef, useEffect } from 'react';
import type { Theme } from '../../types';
import './SettingsMenu.css';

interface ThemeOption {
  value: Theme;
  label: string;
  icon: string;
}

const themeOptions: ThemeOption[] = [
  { value: 'navy-gold', label: '深蓝金', icon: '💎' },
  { value: 'tech-blue', label: '科技蓝', icon: '⚡' },
  { value: 'forest-green', label: '森林绿', icon: '🌿' },
];

interface SettingsMenuProps {
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
  onChangeToken: () => void;
  onExportCsv?: () => void;
}

export function SettingsMenu({ currentTheme, onThemeChange, onChangeToken, onExportCsv }: SettingsMenuProps) {
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
          {onExportCsv && (
            <button
              className="settings-option"
              onClick={() => {
                setIsOpen(false);
                onExportCsv();
              }}
            >
              <span className="settings-option-icon">📊</span>
              <span className="settings-option-label">导出CSV</span>
            </button>
          )}
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
