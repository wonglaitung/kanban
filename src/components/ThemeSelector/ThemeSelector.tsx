import { useState, useRef, useEffect } from 'react';
import type { Theme } from '../../types';
import './ThemeSelector.css';

interface ThemeOption {
  value: Theme;
  label: string;
  icon: string;
  preview: string[];
}

const themeOptions: ThemeOption[] = [
  {
    value: 'dark-neon',
    label: '霓虹暗色',
    icon: '🌌',
    preview: ['#00f0ff', '#0099ff', '#b829ff', '#ff2d95'],
  },
  {
    value: 'light',
    label: '明亮模式',
    icon: '☀️',
    preview: ['#0891b2', '#2563eb', '#7c3aed', '#db2777'],
  },
  {
    value: 'dark',
    label: '简洁暗色',
    icon: '🌙',
    preview: ['#3b82f6', '#64748b', '#8b5cf6', '#ec4899'],
  },
];

interface ThemeSelectorProps {
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
}

export function ThemeSelector({ currentTheme, onThemeChange }: ThemeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentThemeOption = themeOptions.find(t => t.value === currentTheme) || themeOptions[0];

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
    setIsOpen(false);
  };

  return (
    <div className="theme-selector" ref={dropdownRef}>
      <button
        className="theme-selector-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="切换主题"
      >
        <span className="theme-icon">{currentThemeOption.icon}</span>
        <span className="theme-label">{currentThemeOption.label}</span>
        <span className="theme-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="theme-dropdown">
          <div className="theme-dropdown-header">选择主题</div>
          {themeOptions.map((option) => (
            <button
              key={option.value}
              className={`theme-option ${currentTheme === option.value ? 'active' : ''}`}
              onClick={() => handleThemeSelect(option.value)}
            >
              <span className="theme-option-icon">{option.icon}</span>
              <span className="theme-option-label">{option.label}</span>
              <div className="theme-option-preview">
                {option.preview.map((color, index) => (
                  <span
                    key={index}
                    className="preview-color"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              {currentTheme === option.value && (
                <span className="theme-check">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
