# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Kanban board system for small teams (1-5 people) with drag-and-drop task management, SQLite persistence, AI assistant, and simple token-based access control.

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

### AI Service (FastAPI + Harness SDK)
- **Entry**: `ai-service/main.py`
- **Port**: 3002
- **SDK Path**: `/data/harness/packages/sdk` (local development)
- **Memory**: `server/data/MEMORY.md` - shared with database for Docker compatibility
- **Features**: Natural language task queries, automatic memory with capacity limits

### Key Design Patterns
1. **Optimistic Locking**: Tasks use `updatedAt` for conflict detection (409 response)
2. **Batch Updates**: Drag-and-drop uses `/api/tasks/batch` for atomic reordering
3. **Component Structure**: `components/ComponentName/{ComponentName.tsx, ComponentName.css, index.ts}`
4. **Memory Management**: Harness SDK with `MemoryScoringConfig` (3000 tokens limit, auto-archive to `MEMORY_ARCHIVE.md`)

## Common Commands

```bash
# Development (requires three terminals)
npm run dev                           # Frontend dev server (port 5173)
cd server && npm start                # Backend server (port 3001)
cd ai-service && python main.py       # AI service (port 3002, optional)

# Build & Deploy
./build-docker.sh                     # Build Docker image with Harness SDK
./run-docker.sh                       # Run container (reads DOCKER_PORT from .env)

# Code Quality
npm run lint                          # ESLint check
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
2. Review `lessons.md` for relevant architectural patterns and past decisions

After feature changes:
1. Update `progress.txt` with new functionality and commit references
2. Add learnings to `lessons.md` if applicable (especially UI/UX decisions and bug fixes)

## Data Models

See `src/types/index.ts` for full definitions. Key entities:
- **Column**: id, title, order
- **Task**: id, title, description, assignee, priority, dueDate, tags, columnId, order, progress, progressText, createdAt, updatedAt
- **Comment**: id, taskId, author, content, createdAt, updatedAt
- **Settings**: token, theme
- **Theme**: 'dark-neon' | 'light' | 'dark'
- **StaleFilter**: 'all' | '1day' | '3days' | '5days'

## API Endpoints

- Columns: `GET/POST /api/columns`, `PUT/DELETE /api/columns/:id`
- Tasks: `GET/POST /api/tasks`, `PUT/DELETE /api/tasks/:id`, `POST /api/tasks/batch`, `POST /api/tasks/:id/duplicate`
- Comments: `GET/POST /api/tasks/:id/comments`, `PUT/DELETE /api/comments/:id`
- Settings: `GET/PUT /api/settings`
- Export: `GET /api/export/csv` - download all tasks with comments as CSV
- AI: `GET /api/ai/dictionary`, `GET /api/ai/query`, `POST /api/ai/chat`

## Critical Constraints

1. **Token protection** is simple and for internal use only - default token is `123456`
2. **Optimistic locking** on task updates - check for 409 conflicts
3. **SQLite WAL mode** enabled for better concurrency
4. **Database path**: `server/data/kanban.db` (dev), `/app/server/data/kanban.db` (Docker)
5. **Memory path**: `server/data/MEMORY.md` - shared between local dev and Docker
6. **Harness SDK**: Required at `/data/harness/packages/sdk` for AI service development
