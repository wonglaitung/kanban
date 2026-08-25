const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 3003;

app.use(cors());
app.use(express.json());

// WebSocket 服务器
const wss = new WebSocket.Server({ port: WS_PORT });

// 广播任务变更
function broadcastTaskChange(type, task) {
  const message = JSON.stringify({ type, task });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

console.log(`WebSocket server running on port ${WS_PORT}`);

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

// Search tasks by title
app.get('/api/tasks/search', (req, res) => {
  try {
    const { title, status, priority, assignee, overdue } = req.query;

    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];

    if (title) {
      sql += ' AND title LIKE ?';
      params.push(`%${title}%`);
    }

    if (status) {
      sql += ' AND columnId = ?';
      params.push(status);
    }

    if (priority) {
      sql += ' AND priority = ?';
      params.push(priority);
    }

    if (assignee) {
      sql += ' AND assignee LIKE ?';
      params.push(`%${assignee}%`);
    }

    // 逾期过滤：dueDate 不为空，且小于当前日期，且不是已完成状态
    if (overdue === 'true') {
      // 获取已完成列的 ID
      const doneColumn = db.prepare("SELECT id FROM columns WHERE title = '已完成'").get();
      sql += " AND dueDate != '' AND date(dueDate) < date('now')";
      if (doneColumn) {
        sql += ' AND columnId != ?';
        params.push(doneColumn.id);
      }
    } else if (overdue === 'false') {
      // 非逾期：dueDate 为空，或大于等于当前日期，或是已完成状态
      const doneColumn = db.prepare("SELECT id FROM columns WHERE title = '已完成'").get();
      sql += " AND (dueDate = '' OR date(dueDate) >= date('now')";
      if (doneColumn) {
        sql += ' OR columnId = ?';
        params.push(doneColumn.id);
      }
      sql += ')';
    }

    sql += ' ORDER BY "order"';

    const tasks = db.prepare(sql).all(...params);
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
    const parsedTask = parseTask(task);
    broadcastTaskChange('create', parsedTask);
    res.status(201).json(parsedTask);
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
    const parsedTask = parseTask(task);
    broadcastTaskChange('update', parsedTask);
    res.json(parsedTask);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete task
app.delete('/api/tasks/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    broadcastTaskChange('delete', { id });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Duplicate task
app.post('/api/tasks/:id/duplicate', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Get max order in the same column
    const maxOrderResult = db.prepare('SELECT MAX("order") as maxOrder FROM tasks WHERE columnId = ?').get(existing.columnId);
    const newOrder = (maxOrderResult.maxOrder || 0) + 1;

    const newId = 'task-' + Date.now();
    const now = new Date().toISOString();
    
    const stmt = db.prepare(`
      INSERT INTO tasks (id, title, description, assignee, priority, dueDate, tags, columnId, "order", progress, progressText, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Add " (副本)" to the title to indicate it's a duplicate
    const newTitle = existing.title + ' (副本)';
    
    stmt.run(
      newId,
      newTitle,
      existing.description,
      existing.assignee,
      existing.priority,
      existing.dueDate,
      existing.tags,
      existing.columnId,
      newOrder,
      existing.progress,
      existing.progressText,
      now,
      now
    );
    
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(newId);
    res.status(201).json(parseTask(task));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Settings API ===

app.get('/api/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    res.json(settings || { token: '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings', (req, res) => {
  try {
    const { token, theme, announcement } = req.body;

    // Get current settings to preserve values not being updated
    const current = db.prepare('SELECT * FROM settings WHERE id = 1').get();

    const stmt = db.prepare('UPDATE settings SET token = ?, theme = ?, announcement = ? WHERE id = 1');
    stmt.run(token ?? current.token, theme ?? current.theme, announcement ?? current.announcement ?? '');

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

    const updateStmt = db.prepare(`
      UPDATE tasks SET "order" = ?, columnId = ? WHERE id = ?
    `);

    const transaction = db.transaction(() => {
      for (const u of updates) {
        updateStmt.run(u.order, u.columnId || null, u.id);
      }
    });

    transaction();

    const tasks = db.prepare('SELECT * FROM tasks ORDER BY "order"').all();
    res.json(tasks.map(parseTask));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Comments API ===

// Batch comment counts for all tasks (avoids N+1 on the board)
app.get('/api/tasks/comments/counts', (req, res) => {
  try {
    const rows = db
      .prepare('SELECT taskId, COUNT(*) as count FROM comments GROUP BY taskId')
      .all();
    const counts = {};
    for (const row of rows) {
      counts[row.taskId] = row.count;
    }
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all comments for a task
app.get('/api/tasks/:id/comments', (req, res) => {
  try {
    const { id } = req.params;
    // Verify task exists
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const comments = db.prepare(
      'SELECT * FROM comments WHERE taskId = ? ORDER BY createdAt DESC'
    ).all(id);
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create comment for a task
app.post('/api/tasks/:id/comments', (req, res) => {
  try {
    const { id } = req.params;
    const { author, content } = req.body;

    // Verify task exists
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!author || !content) {
      return res.status(400).json({ error: 'Author and content are required' });
    }

    const commentId = 'comment-' + Date.now();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO comments (id, taskId, author, content, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(commentId, id, author, content, now, now);

    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId);
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update comment
app.put('/api/comments/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    const existing = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE comments SET content = ?, updatedAt = ? WHERE id = ?
    `);
    stmt.run(content, now, id);

    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete comment
app.delete('/api/comments/:id', (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    db.prepare('DELETE FROM comments WHERE id = ?').run(id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === MindMap API ===

// Helper: delete a node and its subtree (used recursively within transaction)
function deleteMindMapSubtree(deleteStmt, id) {
  const children = db.prepare('SELECT id FROM mindmap_nodes WHERE parentId = ?').all(id);
  for (const child of children) {
    deleteMindMapSubtree(deleteStmt, child.id);
  }
  deleteStmt.run(id);
}

// Get all mindmap nodes
app.get('/api/mindmap/nodes', (req, res) => {
  try {
    const nodes = db.prepare('SELECT * FROM mindmap_nodes ORDER BY parentId, "order"').all();
    res.json(nodes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a mindmap node
app.post('/api/mindmap/nodes', (req, res) => {
  try {
    const { title, note, color, taskId, parentId } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (taskId) {
      const clash = db.prepare('SELECT id FROM mindmap_nodes WHERE taskId = ?').get(taskId);
      if (clash) {
        return res.status(409).json({ error: '该任务已关联到其他导图节点' });
      }
    }

    const id = 'mm-' + Date.now();
    const now = new Date().toISOString();

    // Compute next order among siblings
    const maxOrder = parentId
      ? (db.prepare('SELECT MAX("order") as maxOrder FROM mindmap_nodes WHERE parentId = ?').get(parentId).maxOrder ?? -1)
      : (db.prepare('SELECT MAX("order") as maxOrder FROM mindmap_nodes WHERE parentId IS NULL').get().maxOrder ?? -1);

    const stmt = db.prepare(`
      INSERT INTO mindmap_nodes (id, title, note, color, taskId, parentId, "order", createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, title, note || '', color || '', taskId || null, parentId || null, maxOrder + 1, now, now);

    const node = db.prepare('SELECT * FROM mindmap_nodes WHERE id = ?').get(id);
    res.status(201).json(node);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a mindmap node
app.put('/api/mindmap/nodes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, note, color, taskId } = req.body;

    const existing = db.prepare('SELECT * FROM mindmap_nodes WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'MindMap node not found' });
    }

    const newTaskId = taskId !== undefined ? taskId : existing.taskId;
    if (newTaskId && newTaskId !== existing.taskId) {
      const clash = db.prepare('SELECT id FROM mindmap_nodes WHERE taskId = ? AND id != ?').get(newTaskId, id);
      if (clash) {
        return res.status(409).json({ error: '该任务已关联到其他导图节点' });
      }
    }

    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE mindmap_nodes SET
        title = ?, note = ?, color = ?, taskId = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(
      title ?? existing.title,
      note !== undefined ? note : existing.note,
      color !== undefined ? color : existing.color,
      taskId !== undefined ? taskId : existing.taskId,
      now,
      id
    );

    const node = db.prepare('SELECT * FROM mindmap_nodes WHERE id = ?').get(id);
    res.json(node);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a mindmap node (cascades to subtree)
app.delete('/api/mindmap/nodes/:id', (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM mindmap_nodes WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'MindMap node not found' });
    }

    const deleteStmt = db.prepare('DELETE FROM mindmap_nodes WHERE id = ?');
    const transaction = db.transaction(() => deleteMindMapSubtree(deleteStmt, id));
    transaction();

    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Batch update mindmap nodes (for drag & drop reparent/reorder)
app.post('/api/mindmap/nodes/batch', (req, res) => {
  try {
    const { updates } = req.body; // Array of { id, parentId?, order? }

    const updateStmt = db.prepare(`
      UPDATE mindmap_nodes SET parentId = ?, "order" = ? WHERE id = ?
    `);

    const transaction = db.transaction(() => {
      for (const u of updates) {
        updateStmt.run(u.parentId || null, u.order ?? 0, u.id);
      }
    });

    transaction();

    const nodes = db.prepare('SELECT * FROM mindmap_nodes ORDER BY parentId, "order"').all();
    res.json(nodes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Export API ===

// Export all tasks with comments as CSV
app.get('/api/export/csv', (req, res) => {
  try {
    // Get all tasks
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY "order"').all();

    // Get all columns for mapping columnId to column title
    const columns = db.prepare('SELECT * FROM columns').all();
    const columnMap = new Map(columns.map(c => [c.id, c.title]));

    // Get all comments
    const comments = db.prepare('SELECT * FROM comments ORDER BY createdAt DESC').all();

    // Group comments by taskId
    const commentsByTask = new Map();
    for (const comment of comments) {
      if (!commentsByTask.has(comment.taskId)) {
        commentsByTask.set(comment.taskId, []);
      }
      commentsByTask.get(comment.taskId).push(comment);
    }

    // CSV header
    const csvHeaders = [
      '任务ID',
      '标题',
      '描述',
      '负责人',
      '优先级',
      '截止日期',
      '进度',
      '进度说明',
      '状态',
      '标签',
      '创建时间',
      '更新时间',
      '评论数',
      '评论内容'
    ];

    // Build CSV rows
    const csvRows = [];

    for (const task of tasks) {
      // Parse tags
      let tags = [];
      try {
        tags = JSON.parse(task.tags || '[]');
      } catch {
        tags = [];
      }

      // Get comments for this task
      const taskComments = commentsByTask.get(task.id) || [];

      // Format comments: 作者:内容@时间 (换行分隔)
      const formattedComments = taskComments.map(c => {
        const time = new Date(c.createdAt).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
        return `${c.author}:${c.content}@${time}`;
      }).join('\n');

      // Format dates
      const formatDate = (dateStr) => {
        if (!dateStr) return '';
        try {
          return new Date(dateStr).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
        } catch {
          return dateStr;
        }
      };

      // Priority mapping
      const priorityMap = { high: '高', medium: '中', low: '低' };

      // Escape CSV field (handle quotes, commas, and newlines)
      const escapeCsvField = (field) => {
        if (field === null || field === undefined) return '';
        const str = String(field);
        // If field contains comma, quote, or newline, wrap in quotes and escape quotes
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };

      const row = [
        escapeCsvField(task.id),
        escapeCsvField(task.title),
        escapeCsvField(task.description || ''),
        escapeCsvField(task.assignee || ''),
        escapeCsvField(priorityMap[task.priority] || task.priority),
        escapeCsvField(task.dueDate || ''),
        escapeCsvField(task.progress || 0),
        escapeCsvField(task.progressText || ''),
        escapeCsvField(columnMap.get(task.columnId) || ''),
        escapeCsvField(tags.join(',')),
        escapeCsvField(formatDate(task.createdAt)),
        escapeCsvField(formatDate(task.updatedAt)),
        escapeCsvField(taskComments.length),
        escapeCsvField(formattedComments)
      ];

      csvRows.push(row.join(','));
    }

    // Build full CSV content with BOM for Excel UTF-8 compatibility
    const csvContent = '\ufeff' + csvHeaders.join(',') + '\n' + csvRows.join('\n');

    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="kanban-export-' + new Date().toISOString().slice(0, 10) + '.csv"');

    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kanban API server running on port ${PORT}`);
});
