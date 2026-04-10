const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Helper: parse tags JSON
const parseTask = (task) => {
  if (task.tags) {
    try {
      task.tags = JSON.parse(task.tags);
    } catch {
      task.tags = [];
    }
  }
  return task;
};

// === Columns API ===

// Get all columns
app.get('/api/columns', (req, res) => {
  try {
    const columns = db.prepare('SELECT * FROM columns ORDER BY "order"').all();
    res.json(columns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create column
app.post('/api/columns', (req, res) => {
  try {
    const { title, order = 0 } = req.body;
    const id = 'col-' + Date.now();
    const stmt = db.prepare('INSERT INTO columns (id, title, "order") VALUES (?, ?, ?)');
    stmt.run(id, title, order);
    const column = db.prepare('SELECT * FROM columns WHERE id = ?').get(id);
    res.status(201).json(column);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update column
app.put('/api/columns/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, order } = req.body;
    
    const existing = db.prepare('SELECT * FROM columns WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Column not found' });
    }

    const stmt = db.prepare('UPDATE columns SET title = ?, "order" = ? WHERE id = ?');
    stmt.run(title ?? existing.title, order ?? existing.order, id);
    
    const column = db.prepare('SELECT * FROM columns WHERE id = ?').get(id);
    res.json(column);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete column
app.delete('/api/columns/:id', (req, res) => {
  try {
    const { id } = req.params;
    // Move tasks to another column or delete them
    const columns = db.prepare('SELECT id FROM columns WHERE id != ?').all(id);
    if (columns.length > 0) {
      const targetColumnId = columns[0].id;
      db.prepare('UPDATE tasks SET columnId = ? WHERE columnId = ?').run(targetColumnId, id);
    } else {
      db.prepare('DELETE FROM tasks WHERE columnId = ?').run(id);
    }
    db.prepare('DELETE FROM columns WHERE id = ?').run(id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Tasks API ===

// Get all tasks
app.get('/api/tasks', (req, res) => {
  try {
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY "order"').all();
    res.json(tasks.map(parseTask));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single task
app.get('/api/tasks/:id', (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(parseTask(task));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create task
app.post('/api/tasks', (req, res) => {
  try {
    const { title, description, assignee, priority, dueDate, tags, columnId, order, progress, progressText } = req.body;
    const id = 'task-' + Date.now();
    const now = new Date().toISOString();
    
    const stmt = db.prepare(`
      INSERT INTO tasks (id, title, description, assignee, priority, dueDate, tags, columnId, "order", progress, progressText, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, title, description || '', assignee || '', priority || 'medium', dueDate || '', JSON.stringify(tags || []), columnId, order || 0, progress || 0, progressText || '', now, now);
    
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    res.status(201).json(parseTask(task));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update task (with optimistic locking)
app.put('/api/tasks/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, assignee, priority, dueDate, tags, columnId, order, progress, progressText, updatedAt: clientUpdatedAt } = req.body;
    
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Optimistic lock check
    if (clientUpdatedAt && existing.updatedAt !== clientUpdatedAt) {
      return res.status(409).json({ 
        error: '数据已被其他用户修改，请刷新后重试',
        currentData: parseTask(existing)
      });
    }

    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE tasks SET 
        title = ?, description = ?, assignee = ?, priority = ?, dueDate = ?, 
        tags = ?, columnId = ?, "order" = ?, progress = ?, progressText = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(
      title ?? existing.title,
      description ?? existing.description,
      assignee ?? existing.assignee,
      priority ?? existing.priority,
      dueDate ?? existing.dueDate,
      JSON.stringify(tags ?? JSON.parse(existing.tags || '[]')),
      columnId ?? existing.columnId,
      order ?? existing.order,
      progress ?? existing.progress,
      progressText ?? existing.progressText,
      now,
      id
    );
    
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    res.json(parseTask(task));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete task
app.delete('/api/tasks/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Settings API ===

app.get('/api/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    res.json(settings || { password: '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings', (req, res) => {
  try {
    const { password } = req.body;
    const stmt = db.prepare('UPDATE settings SET password = ? WHERE id = 1');
    stmt.run(password);
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Batch update tasks (for drag & drop reorder)
app.post('/api/tasks/batch', (req, res) => {
  try {
    const { updates } = req.body; // Array of { id, order, columnId? }
    const now = new Date().toISOString();
    
    const updateStmt = db.prepare(`
      UPDATE tasks SET "order" = ?, columnId = ?, updatedAt = ? WHERE id = ?
    `);
    
    const transaction = db.transaction(() => {
      for (const u of updates) {
        updateStmt.run(u.order, u.columnId || null, now, u.id);
      }
    });
    
    transaction();
    
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY "order"').all();
    res.json(tasks.map(parseTask));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kanban API server running on port ${PORT}`);
});
