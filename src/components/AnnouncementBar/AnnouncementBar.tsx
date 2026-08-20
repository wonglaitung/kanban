import { useState } from 'react';
import './AnnouncementBar.css';

interface AnnouncementBarProps {
  announcement: string;
}

const HIDE_KEY = 'kanban_announcement_hidden';

export function AnnouncementBar({ announcement }: AnnouncementBarProps) {
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(HIDE_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (!announcement || !announcement.trim() || hidden) {
    return null;
  }

  const dismiss = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(HIDE_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="announcement-bar">
      <span className="announcement-icon">📢</span>
      <span className="announcement-text" title={announcement}>{announcement}</span>
      <button className="announcement-dismiss" onClick={dismiss} title="关闭公告" aria-label="关闭公告">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
