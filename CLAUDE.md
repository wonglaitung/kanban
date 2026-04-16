# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Kanban board system for small teams (1-5 people) with drag-and-drop task management, SQLite persistence, and simple token-based access control.

## Architecture

### Frontend (React + TypeScript + Vite)
- **Entry**: `src/main.tsx` → `src/App.tsx`
- **State Management**: Custom hooks in `src/hooks/` (useTasks, useColumns)
- **Components**: Each component has its own directory with `.tsx`, `.css`, `index.ts`
- **API Layer**: `src/services/api.ts` - centralized Axios client with conflict error handling
- **Types**: `src/types/index.ts` - shared TypeScript interfaces

### Backend (Express + better-sqlite3)
- **Entry**: `server/server.js`
- **Database**: `server/db.js` - SQLite with WAL mode, auto-initializes schema
- **Port**: 3001

### Key Design Patterns
1. **Optimistic Locking**: Tasks use `updatedAt` for conflict detection (409 response)
2. **Batch Updates**: Drag-and-drop uses `/api/tasks/batch` for atomic reordering
3. **Component Structure**: `components/ComponentName/{ComponentName.tsx, ComponentName.css, index.ts}`

## Common Commands

```bash
# Development (requires two terminals)
npm run dev              # Frontend dev server (port 5173)
cd server && npm start   # Backend server (port 3001)

# Build & Deploy
npm run build            # TypeScript compile + Vite build
docker build -t kanban-board . && docker run --name kanban -p 80:80 kanban-board

# Code Quality
npm run lint             # ESLint check
```

## Database Migration Pattern

Always use backward-compatible migrations:

```javascript
// Create new table
CREATE TABLE IF NOT EXISTS table_name (...)

// Add column (with error handling)
try {
  db.exec('ALTER TABLE table ADD COLUMN col TEXT DEFAULT \'value\'');
} catch (e) { /* Column exists */ }

// Create index
CREATE INDEX IF NOT EXISTS idx_name ON table(column)
```

## Session Workflow (Required)

At start of each session:
1. Read `progress.txt` to understand current project state
2. Review `lessons.md` for relevant architectural patterns

After feature changes:
1. Update `progress.txt` with new functionality
2. Add learnings to `lessons.md` if applicable

## Data Models

See `src/types/index.ts` for full definitions. Key entities:
- **Column**: id, title, order
- **Task**: id, title, description, assignee, priority, dueDate, tags, columnId, order, progress, progressText, createdAt, updatedAt
- **Comment**: id, taskId, author, content, createdAt, updatedAt
- **Settings**: token, theme

## API Endpoints

- Columns: `GET/POST /api/columns`, `PUT/DELETE /api/columns/:id`
- Tasks: `GET/POST /api/tasks`, `PUT/DELETE /api/tasks/:id`, `POST /api/tasks/batch`, `POST /api/tasks/:id/duplicate`
- Comments: `GET/POST /api/tasks/:id/comments`, `PUT/DELETE /api/comments/:id`
- Settings: `GET/PUT /api/settings`

## Critical Constraints

1. **Token protection** is simple and for internal use only
2. **Optimistic locking** on task updates - check for 409 conflicts
3. **SQLite WAL mode** enabled for better concurrency
4. **Database path**: `server/data/kanban.db` (dev), `/app/server/data/kanban.db` (Docker)
