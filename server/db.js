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

  // Add theme column if it doesn't exist (migration for existing databases)
  try {
    db.exec('ALTER TABLE settings ADD COLUMN theme TEXT DEFAULT \'dark-neon\'');
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
