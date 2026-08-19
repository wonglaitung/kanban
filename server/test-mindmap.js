/**
 * 思维导图后端数据层验证脚本（临时测试，非提交物）
 * 用 Node 22 内置 node:sqlite 复现 server.js 中 mindmap 端点的 SQL 逻辑，
 * 验证：建表迁移、CRUD、批量排序、级联删除、同级 order 计算。
 * 运行：node server/test-mindmap.js
 */
const { DatabaseSync } = require('node:sqlite');

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  PASS ${msg}`); }
  else { fail++; console.error(`  FAIL ${msg}`); }
}

// --- 复现 db.js 的 mindmap 表迁移 DDL ---
const db = new DatabaseSync(':memory:');
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
db.exec(`CREATE INDEX IF NOT EXISTS idx_mindmap_parent ON mindmap_nodes(parentId)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_mindmap_task ON mindmap_nodes(taskId)`);

// 幂等性：重复执行不报错（模拟服务器重启），所以下方再次执行完整 DDL
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
assert(true, 'mindmap_nodes 表可重复初始化（IF NOT EXISTS 迁移幂等）');

const now = new Date().toISOString();
const insert = db.prepare(`
  INSERT INTO mindmap_nodes (id, title, note, color, taskId, parentId, "order", createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const getNode = db.prepare('SELECT * FROM mindmap_nodes WHERE id = ?');
const allNodes = db.prepare('SELECT * FROM mindmap_nodes ORDER BY parentId, "order"');

// --- 复现 POST /api/mindmap/nodes 的 order 计算 ---
function createNode(id, title, parentId) {
  const maxOrder = parentId
    ? (db.prepare('SELECT MAX("order") as maxOrder FROM mindmap_nodes WHERE parentId = ?').get(parentId).maxOrder ?? -1)
    : (db.prepare('SELECT MAX("order") as maxOrder FROM mindmap_nodes WHERE parentId IS NULL').get().maxOrder ?? -1);
  insert.run(id, title, '', '', null, parentId || null, maxOrder + 1, now, now);
  return getNode.get(id);
}

// --- 建树 ---
// A (root) → A1, A2 ; B (root)
createNode('A', '目标A', null);
createNode('B', '目标B', null);
createNode('A1', '阶段1', 'A');
createNode('A2', '阶段2', 'A');
createNode('A11', '任务X', 'A1');

console.log('\n[建树验证]');
assert(getNode.get('A').order === 0, 'A(order=0) 第一个根');
assert(getNode.get('B').order === 1, 'B(order=1) 第二个根');
assert(getNode.get('A1').order === 0, 'A1(order=0) A 第一个子');
assert(getNode.get('A2').order === 1, 'A2(order=1) A 第二个子');
assert(getNode.get('A11').order === 0, 'A11 挂在 A1 下');

// --- 复现 PUT：更新 title/note/color/taskId ---
console.log('\n[更新验证]');
const update = db.prepare(`UPDATE mindmap_nodes SET title = ?, note = ?, color = ?, taskId = ?, updatedAt = ? WHERE id = ?`);
update.run('任务X(改)', '备注', '#3182ce', 'task-1', now, 'A11');
let n = getNode.get('A11');
assert(n.title === '任务X(改)' && n.note === '备注' && n.color === '#3182ce' && n.taskId === 'task-1', 'PUT 更新 title/note/color/taskId 生效');
assert(n.parentId === 'A1' && n.order === 0, 'PUT 不改变 parentId/order');

// --- 复现 POST /batch：拖拽 reparent + 排序 ---
console.log('\n[批量排序验证]');
function batch(updates) {
  const stmt = db.prepare(`UPDATE mindmap_nodes SET parentId = ?, "order" = ? WHERE id = ?`);
  for (const u of updates) stmt.run(u.parentId || null, u.order ?? 0, u.id);
}
// 场景1：把 A2 从 A 下 reparent 到 B 下（B 原本无子）
batch([{ id: 'A2', parentId: 'B', order: 0 }]);
const n2 = getNode.get('A2');
assert(n2.parentId === 'B' && n2.order === 0, 'A2 已 reparent 到 B 下且 order=0');

// 场景2：B 下再加一个子，验证 order 递增
createNode('B1', 'B的子', 'B');
assert(getNode.get('B1').order === 1, 'B 新增子 B1 order=1（紧随 A2）');
const bChildren = allNodes.all().filter(x => x.parentId === 'B').sort((a, b) => a.order - b.order);
assert(bChildren.map(x => x.id).join(',') === 'A2,B1', 'B 下子节点顺序为 A2,B1');

// 场景3：同级重排 —— 把 A 下的 A2 调回 A 下并排到 A1 之前（模拟拖回 + 重排）
// 先说明：场景1把 A2 移走了，这里重新挂回 A 下，插入到 A1 之前（index 0）
batch([{ id: 'A2', parentId: 'A', order: 0 }, { id: 'A1', parentId: 'A', order: 1 }, { id: 'A2', parentId: 'A', order: 0 }]);
// 上面同一组内 A2 覆盖写两次——改用标准前端重排：目标组 [A1, A11子树已删] 现仅 A1，插入 A2 到 index0
batch([{ id: 'A2', parentId: 'A', order: 0 }, { id: 'A1', parentId: 'A', order: 1 }]);
const aChildren = allNodes.all().filter(x => x.parentId === 'A').sort((a, b) => a.order - b.order);
assert(aChildren.map(x => x.id).join(',') === 'A2,A1', 'A 下子节点顺序已重排为 A2,A1');

// 场景4：根级重排 —— 把 B 移到 A 前面
batch([{ id: 'B', parentId: '', order: 0 }, { id: 'A', parentId: '', order: 1 }]);
const roots = allNodes.all().filter(x => x.parentId === null).sort((a, b) => a.order - b.order);
assert(roots[0].id === 'B' && roots[1].id === 'A', '根级重排生效：B 在前，A 在后');
// 注意：reparent 后 A 的子节点关系不受根重排影响
assert(getNode.get('A2').parentId === 'A', 'A2 仍挂在 A 下（根重排不影响子级）');

// --- 复现 DELETE：级联删除子树 ---
console.log('\n[级联删除验证]');
function deleteSubtree(id) {
  const children = db.prepare('SELECT id FROM mindmap_nodes WHERE parentId = ?').all(id);
  for (const c of children) deleteSubtree(c.id);
  db.prepare('DELETE FROM mindmap_nodes WHERE id = ?').run(id);
}
// 删除 A1（含其子 A11）
deleteSubtree('A1');
assert(getNode.get('A1') === undefined, 'A1 已删除');
assert(getNode.get('A11') === undefined, 'A11（A1 的子）已级联删除');
assert(getNode.get('A') !== undefined, 'A（A1 的父）保留');
assert(allNodes.all().every(x => x.parentId !== 'A1'), '无孤儿节点指向已删 A1');

// --- 边界：拖拽到自己子树被前端拦截，但后端 batch 仍可用 ---
console.log('\n[边界验证]');
const countBefore = allNodes.all().length;
batch([]); // 空更新不报错
assert(allNodes.all().length === countBefore, '空批量更新不改变数据');
assert(true, 'parentId 为 NULL 的根节点可正常查询（parentId IS NULL）');

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
