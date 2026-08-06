import './AnnouncementBar.css';

interface AnnouncementBarProps {
  announcement: string;
}

export function AnnouncementBar({ announcement }: AnnouncementBarProps) {
  if (!announcement || !announcement.trim()) {
    return null;
  }

  return (
    <div className="announcement-bar">
      <span className="announcement-icon">📢</span>
      <span className="announcement-text" title={announcement}>{announcement}</span>
    </div>
  );
}
