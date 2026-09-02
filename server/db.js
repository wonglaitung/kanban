const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'kanban.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Initialize database schema
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS columns (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      assignee TEXT,
      priority TEXT DEFAULT 'medium',
      dueDate TEXT,
      tags TEXT DEFAULT '[]',
      columnId TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0,
      progress INTEGER DEFAULT 0,
      progressText TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (columnId) REFERENCES columns(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      token TEXT,
      theme TEXT DEFAULT 'dark-neon'
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for comments table
  db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_taskId ON comments(taskId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_createdAt ON comments(createdAt)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS mindmap_nodes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      note TEXT DEFAULT '',
      color TEXT DEFAULT '',
      taskId TEXT,
      parentId TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  // Create indexes for mindmap table
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mindmap_parent ON mindmap_nodes(parentId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mindmap_task ON mindmap_nodes(taskId)`);

  // Clean up historical duplicate task links (keep earliest node per taskId, null the rest)
  try {
    db.exec(`
      UPDATE mindmap_nodes
      SET taskId = NULL
      WHERE id NOT IN (
        SELECT MIN(id) FROM mindmap_nodes WHERE taskId IS NOT NULL GROUP BY taskId
      ) AND taskId IS NOT NULL
    `);
  } catch (e) {
    // ignore cleanup errors
  }

  // Enforce one-to-one link between tasks and mindmap nodes (partial unique index allows multiple NULLs)
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mindmap_task_unique ON mindmap_nodes(taskId) WHERE taskId IS NOT NULL`);
  } catch (e) {
    // index already exists
  }

  // Add done column to mindmap_nodes if it doesn't exist (migration for completion marking)
  try {
    db.exec('ALTER TABLE mindmap_nodes ADD COLUMN done INTEGER DEFAULT 0');
  } catch (e) {
    // Column already exists, ignore error
  }

  // Add theme column if it doesn't exist (migration for existing databases)
  try {
    db.exec('ALTER TABLE settings ADD COLUMN theme TEXT DEFAULT \'dark-neon\'');
  } catch (e) {
    // Column already exists, ignore error
  }

  // Add announcement column if it doesn't exist (migration for existing databases)
  try {
    db.exec('ALTER TABLE settings ADD COLUMN announcement TEXT DEFAULT \'\'');
  } catch (e) {
    // Column already exists, ignore error
  }

  // Insert default data if not exists
  const settingsStmt = db.prepare('SELECT * FROM settings WHERE id = 1');
  if (!settingsStmt.get()) {
    db.prepare('INSERT INTO settings (id, token, theme) VALUES (1, ?, ?)').run('123456', 'dark-neon');
  }

  const columnCount = db.prepare('SELECT COUNT(*) as count FROM columns').get().count;
  if (columnCount === 0) {
    const insertColumn = db.prepare('INSERT INTO columns (id, title, "order") VALUES (?, ?, ?)');
    insertColumn.run('col-1', '待办', 0);
    insertColumn.run('col-2', '进行中', 1);
    insertColumn.run('col-3', '审核', 2);
    insertColumn.run('col-4', '已完成', 3);
  }
}

initSchema();

module.exports = db;
