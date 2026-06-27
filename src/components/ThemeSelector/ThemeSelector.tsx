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
    value: 'navy-gold',
    label: '深蓝金',
    icon: '💎',
    preview: ['#1e3a5f', '#c9a227', '#2a4a73', '#d4b23a'],
  },
  {
    value: 'tech-blue',
    label: '科技蓝',
    icon: '⚡',
    preview: ['#0052cc', '#4a5568', '#3182ce', '#718096'],
  },
  {
    value: 'forest-green',
    label: '森林绿',
    icon: '🌿',
    preview: ['#0d4f3c', '#6b7280', '#34d399', '#9ca3af'],
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
