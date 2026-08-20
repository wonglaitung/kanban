# 开发经验与学习笔记

## 思维导图开发经验

### 37h. 兄弟重排的终极方案：插入线跟随光标（取代按卡分区）
**问题背景**: 用户第三次反馈"2 和 4 交换位置困难"。v4 二维分区逻辑正确（e2e 实测能交换），但 UX 仍差：定位需拖过中间节点精确命中小区域；第一个子节点上方仅 10px 细带且易误触父节点（拖到父卡会变成根节点/追加）
**改进（v5）**: 插入线跟随光标模型
```tsx
// 分区（MindMapNode 内判定）
if (isInvalid) zone = 'blocked';
else if (y在卡内 && x >= 卡宽/2) zone = 'child';
else zone = 'insert';  // 左半卡 + 上下带全部 = 同级插入
// 插入线（MindMap 端，dragover 时计算）
cardRects = siblings.map(s => query(`[data-node-id="${s.id}"] .mm-node-card`).getBoundingClientRect());
index = 第一个 card.midpoint > clientY 的下标;
lineY = index==0 ? card[0].top-5 : index==n ? card[n-1].bottom+5 : (card[i-1].bottom + card[i].top)/2;
// 插入线渲染在 .mindmap-tree(position:relative) 内，坐标 = viewport坐标 - treeRect
```
**经验总结**:
- "按卡片划分精确命中区"总有极限：卡片小、兄弟多、跨中间节点时定位难。**让指示器跟随光标、drop 落在指示器处**才是重排类交互的正解（dnd-kit 列表同理）
- 判定分区与落点几何要解耦：卡片判定 Zone（child/insert/blocked）在子组件，插入 index/线坐标计算在父组件（需要全兄弟组几何）
- 用 `data-node-id` + `querySelector` 在 dragover 时取 DOM rect 做几何计算，简单可靠（无需 ref 集合传递）
- 视觉反馈优先级：跟随线 > 单卡高亮，用户在拖拽中"看线放"，而非"瞄准卡"

### 37f. 顶部工具栏瘦身：全宽横条 → fit-content 胶囊
**问题背景**: 用户反馈「工作主线太长、占地方」——思维导图顶部工具栏是通栏全宽横条（1162×61px），只为放一个 label + 一个按钮，视觉和空间浪费
**改进**: `display: inline-flex; width: fit-content` + `border-radius: 999px` + 缩小 padding/字号，变为自适应宽度的紧凑胶囊（182×42px），宽度缩减约 85%；保留 `position: sticky` 以便长树滚动时按钮仍可达
**经验总结**:
- 工具栏不必总是通栏铺满容器：内容少时用 `width: fit-content` 自适应，既省空间又聚焦
- sticky + fit-content 可共存（滚动时小胶囊仍固定在顶部），功能不因瘦身丢失

### 37g. 工具栏彻底不占行：文档流 → 悬浮 FAB
**问题背景**: 即使 fit-content 胶囊仍是文档流块级元素，占一整行高度；用户要的是"不占行"
**改进**: 把工具按钮移出文档流，改为绝对定位悬浮 FAB：
- MindMap 外包 `.mindmap { position:relative; flex:1; min-height:0; display:flex }`，`.mindmap-canvas { flex:1 }` 填满
- 按钮 `.mindmap-fab { position:absolute; right/bottom:28px; 40×40 圆形 }`，不占任何行，画布滚动在下方
- 空树时仍保留居中"添加根节点"按钮，FAB 仅在存在根节点时显示
**经验总结**:
- "占一行"的本质是元素在文档流中；彻底解决是移出文档流（absolute/fixed），而非继续缩小
- 悬浮按钮与滚动容器配合：absolute 定位于外层非滚动容器，画布内部滚动互不干扰
- 顺带识别出另一条占行元素——公告条：提供"×"关闭（sessionStorage 持久化隐藏），用户可随时收起

### 37c. HTML5 DnD 两个隐形大坑

**坑 1：drop 事件会冒泡，导致"双重处理"**
- 现象：节点内 drop 处理后，事件继续冒泡到容器级 drop handler（如"拖到画布变根节点"），同一拖拽被处理两次，结果随机（取决于异步 API 返回顺序）
- 修复：节点 handler 加 `e.stopPropagation()`，让"落到节点上"和"落到空白处"互斥

**坑 2：无效节点上 preventDefault + dropEffect='none' 会锁死拖拽**
- 现象：对无效落点（自身子树）同时 `preventDefault()` 和 `dataTransfer.dropEffect='none'`，Chromium 会判定整个拖拽"不可放置"，从此不再向光标下的其他元素派发 dragover，indicator 卡死在源节点
- 修复：**仅对有效节点调用 `preventDefault()`**；无效节点不 preventDefault（浏览器自然显示禁止光标），但仍上报 `blocked` 状态驱动 UI 反馈

**经验总结**:
- HTML5 DnD 的 dragover 派发高度依赖 preventDefault 状态，任何"局部禁止"都要小心是否影响全局
- 事件冒泡在 DnD 场景下尤其隐蔽：父容器 onDrop + 子节点 onDrop 会级联触发
- 调试这类问题：临时在 handler 里 console.log 事件到达情况，比盯 indicator 盲猜高效得多

### 37b. 拖拽落点区域划分：左右分区优于横向三分
**问题背景**: 第一版按横向三档（左30%前/中40%子/右30%后），用户反馈"放节点到不同层级很困难"

**改进方案（v2）**: x 在卡片右半屏 → child，左半屏再按 y 上下分 before/after
```tsx
function resolveDropPosition(rect, x, y) {
  if (x >= rect.width * 0.5) return 'child';          // 右半屏 = 成为子节点
  return y < rect.height * 0.5 ? 'before' : 'after';  // 左半屏上下 = 插入前/后
}
```

**经验总结**:
- **拖拽落点建议二维分区而非一维**：单用 x 时 child 命中带窄且要求横向精确对准；x 管层级（右=深）、y 管顺序（上下=前/后），命中面更大、更符合直觉
- **dragover 预览与 drop 判定必须同源**：抽成共用纯函数，否则预览与最终落点不一致会让用户困惑（旧代码两处 copy-paste 逻辑一旦漂移即出此 bug）
- 视觉反馈要配合落点：child 用虚线分支+卡片位移表达"层级加深"，比单色遮罩更直观

### 37d. v2 左右分区仍难用 → 垂直直觉模型（v3）
**问题背景**: v2（右半=child、左半上下=before/after）用户仍反馈"落点语义不清楚、命中区域太小、无效落点无提示"
**改进方案（v3）**: 卡片外包一层 `.mm-node-drop`（上下各 10px padding），垂直三段：
```tsx
const DROP_BAND = 10;
function resolveDropPosition(rect, y) {
  if (y < DROP_BAND) return 'before';              // 卡片上方带 = 插前
  if (y > rect.height - DROP_BAND) return 'after'; // 卡片下方带 = 插后
  return 'child';                                   // 落到卡片本体 = 成为子节点
}
```
- before/after 命中面从「左半屏 100×18px」扩大为「卡片全宽 × 10px 上下带」
- child 命中面 = 整张卡片（最大面积、最直觉：落到卡上就是变子节点）
- 无效反馈：拖拽源子树整体置灰（`invalid`），悬停时红虚线框（`blocked`）+ 禁止光标 + drop 拦截
- 附加：悬停折叠节点 child 区自动展开，便于深入层级

**经验总结**:
- 树形拖拽的语义要贴近"列表插入 + 落到卡上"的通用直觉（上=前、下=后、卡上=子），而不是用 x 轴方向表达层级——x 语义需要用户记忆，y 语义天然可读
- 用 wrapper padding 制造命中带（而非压缩卡片内部），命中面更大且不挤压卡片内容；配合负 margin 保持原有间距
- 无效反馈要"常显 + 悬停强化"两级：子树置灰（常显）+ 悬停红框（强化），用户拖拽途中始终知道哪里不能放

### 37e. 相邻兄弟节点交换难 → v4 二维分区（右=子、左=前后、全宽带=前后）
**问题背景**: v3 下"交换相邻兄弟顺序"仍困难（如 1→[3,2,4] 换 2/4）。根因：before/after 只在卡片外 10px 缝隙（200×10=2000px²），极易误落到卡片上变成 child
**改进方案（v4）**: 二维分区，三个档位面积均衡（各约 4000px²）：
```tsx
function resolveDropPosition(rect, x, y) {
  if (y < DROP_BAND) return 'before';                  // 上全宽带 = 前
  if (y > rect.height - DROP_BAND) return 'after';     // 下全宽带 = 后
  const cardH = rect.height - DROP_BAND * 2;
  const cy = y - DROP_BAND;
  if (x >= rect.width * 0.5) return 'child';           // 右半卡 = 子节点
  return cy < cardH * 0.5 ? 'before' : 'after';        // 左半卡上下 = 前/后
}
```
- 交换兄弟：拖到目标卡片**左上角/右上角（左半卡上部）**或上方全宽带即可，不再要求命中 10px 缝隙
- 三档面积：before = 上带 2000 + 左上半 2000 = 4000；after 同理；child = 右半卡 4000
- before/after 指示线贴卡片上下边缘（-1px），两种触发路径共用同一视觉锚点

**经验总结**:
- 相邻交换的本质是需要"足够大的前后插入目标"；外部缝隙带太窄，必须借用卡片本身面积（左半卡上半 = before）
- 一维垂直分区无法同时给足 child 与 before/after；**x 管层级、y 管顺序**的二维分区是树形 DnD 的面积均衡解
- 右半卡=child 与树布局方向一致（子节点在右），符合"往右拖=加深"直觉
- e2e 测试数据标题要与用户真实数据区分（避免选择器误匹配用户节点），并在测试后彻底清理+核对数据

### 37. 树形结构的拖拽与递归渲染
**需求背景**: 思维导图需要拖拽调整节点层级（reparent）与顺序

**实现方案**:
1. **递归渲染**: 每个节点组件从全量 nodes 数组计算 children 并递归渲染（而非传 children 数组），避免父组件重复计算
2. **HTML5 原生 DnD**: 用 `draggable` + `onDragOver/onDrop`，按鼠标在目标卡片内的位置判定落点
3. **批处理排序**: drop 后对目标同级组整组重编号（0..n-1），POST /batch 事务更新 parentId+order
4. **防循环**: isDescendant 检查阻止把节点拖入自身子树

**关键代码**:
```tsx
// 按 x 位置判定落点
const x = e.clientX - rect.left;
let position = x < width * 0.3 ? 'before' : x > width * 0.7 ? 'after' : 'child';
```

**经验总结**:
- 递归组件传全量数据 + 自己算 children，比传构造好的 children 数组更简洁、无需每层重建
- HTML5 DnD 拖拽到子级卡片时 onDragOver 高频触发 setState，用 prev 比较去重避免重渲染风暴
- 树形 reparent + 排序一次 batch 提交，比逐条 PUT 更可靠、更少请求

### 37b. 拖拽落点区域划分：左右分区优于横向三分
**问题背景**: 第一版按横向三档（左30%前/中40%子/右30%后），用户反馈"放节点到不同层级很困难"

**改进方案（v2）**: x 在卡片右半屏 → child，左半屏再按 y 上下分 before/after
```tsx
function resolveDropPosition(rect, x, y) {
  if (x >= rect.width * 0.5) return 'child';          // 右半屏 = 成为子节点
  return y < rect.height * 0.5 ? 'before' : 'after';  // 左半屏上下 = 插入前/后
}
```

**经验总结**:
- **拖拽落点建议二维分区而非一维**：单用 x 时 child 命中带窄且要求横向精确对准；x 管层级（右=深）、y 管顺序（上下=前/后），命中面更大、更符合直觉
- **dragover 预览与 drop 判定必须同源**：抽成共用纯函数，否则预览与最终落点不一致会让用户困惑（旧代码两处 copy-paste 逻辑一旦漂移即出此 bug）
- 视觉反馈要配合落点：child 用虚线分支+卡片位移表达"层级加深"，比单色遮罩更直观

### 38. 与 @dnd-kit 的取舍
**问题背景**: 项目已有 @dnd-kit（看板拖拽），思维导图拖拽是否复用？

**决策**: 树形结构用原生 HTML5 DnD，而非 @dnd-kit
- @dnd-kit 适合线性 sortable（列/卡片），树形 reparent 需要自定义落点判定
- 原生 DnD 零依赖、判定逻辑直白，且思维导图拖拽频率低、不需要动画/无障碍增强
- 经验：**先匹配场景再选工具**，同一项目不同交互可用不同方案

---

## 技术选型经验

### 1. 拖拽库选择：@dnd-kit
**选择理由**:
- 现代化设计，性能优秀
- 无障碍支持好
- TypeScript 支持完善
- 社区活跃，文档详细

**替代方案**:
- react-beautiful-dnd: 功能强大但已停止维护
- react-dnd: 功能复杂，学习曲线陡峭
- dnd-core: 底层库，需要更多自定义

**经验总结**:
选择库时要考虑维护状态、社区活跃度和 TypeScript 支持。@dnd-kit 在这些方面表现优秀。

---

### 2. 后端迁移：JSON Server → SQLite
**迁移原因**:
- JSON Server 适合原型开发，但生产环境可靠性不足
- SQLite 提供真正的数据库功能：事务、查询优化、并发控制
- better-sqlite3 性能优秀，同步 API 更易用

**迁移过程**:
1. 保留原有 API 接口设计
2. 创建 Express 服务器替代 JSON Server
3. 实现数据库初始化和迁移脚本
4. 添加乐观锁机制处理并发

**经验总结**:
原型开发可以用简化工具，但要为生产环境迁移做好准备。保留 API 接口不变，可以减少前端改动。

---

## 架构设计经验

### 3. 组件结构设计
**采用模式**: 组件独立目录 + index.ts 导出

**目录结构**:
```
components/
├── Board/
│   ├── Board.tsx
│   ├── Board.css
│   └── index.ts
```

**优点**:
- 组件相关文件集中管理
- 便于移动和重构
- 导入路径简洁 (`import Board from './Board'`)

**经验总结**:
良好的目录结构能提升开发效率，便于团队协作和代码维护。

---

### 4. 自定义 Hooks 封装
**设计的 Hooks**:
- `useTasks`: 任务 CRUD 操作
- `useColumns`: 列管理操作
- `useDragDrop`: 拖拽逻辑封装

**优点**:
- 业务逻辑与 UI 分离
- 逻辑复用性强
- 便于测试和维护

**经验总结**:
合理使用自定义 Hooks 可以让组件更专注于 UI 渲染，逻辑更清晰可测试。

---

## 并发控制经验

### 5. 乐观锁实现
**实现方式**: 基于 `updatedAt` 字段

**流程**:
1. 客户端获取任务数据（包含 updatedAt）
2. 用户编辑任务
3. 提交更新时携带原始 updatedAt
4. 服务端验证 updatedAt 是否匹配
5. 不匹配则拒绝更新，提示用户刷新

**代码示例**:
```typescript
// 更新任务时检查版本
const updateTask = async (taskId: string, updates: Partial<Task>) => {
  const currentTask = await api.getTask(taskId);
  
  if (updates.updatedAt !== currentTask.updatedAt) {
    throw new Error('数据已被其他用户修改，请刷新后重试');
  }
  
  return api.updateTask(taskId, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
};
```

**经验总结**:
乐观锁简单有效，适合小型团队的并发控制。冲突时提示用户刷新，避免数据覆盖。

---

## UI/UX 优化经验

### 6. 暗色主题设计
**设计风格**: 赛博朋克风格

**配色方案**:
- 主背景: 深色渐变
- 卡片背景: 半透明玻璃效果
- 强调色: 霓虹色系（蓝、紫、粉）
- 优先级标识: 红、黄、绿

**CSS 技巧**:
```css
.card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```

**经验总结**:
暗色主题需要注意对比度，确保文字可读性。使用 backdrop-filter 可以创造现代感的玻璃态效果。

---

### 7. 紧凑型卡片设计
**设计目标**: 提高信息密度，一屏显示更多任务

**优化措施**:
- 移除冗余的进度条，用数字显示进度
- 缩小卡片尺寸
- 优化字体大小和间距
- 精简显示字段

**效果**:
- 卡片高度减少 50%
- 同屏可显示更多任务
- 信息密度提升，但保持可读性

**经验总结**:
在信息密度和可读性之间找平衡，通过用户反馈不断调整。紧凑设计适合专业用户，但也要考虑新用户的体验。

---

## Docker 部署经验

### 8. 容器化配置
**Dockerfile 结构**:
```dockerfile
# 构建阶段
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 运行阶段
FROM node:18-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
WORKDIR /app/server
RUN npm ci --only=production
RUN apk add --no-cache sqlite
EXPOSE 80
CMD ["node", "server.js"]
```

**经验总结**:
使用多阶段构建可以减小镜像体积。在运行阶段安装 sqlite CLI 工具，方便容器内数据库管理。

---

### 9. 数据持久化
**数据存储位置**:
- 开发环境: `server/data/kanban.db`
- Docker 环境: `/app/server/data/kanban.db`

**备份策略**:
- 定期备份 SQLite 文件
- 可使用数据卷挂载持久化数据
- 建议实现自动备份脚本

**经验总结**:
SQLite 文件数据库便于备份和迁移，适合小型应用。生产环境要注意数据备份策略。

---

## 安全考虑

### 10. 令牌保护机制
**实现方式**:
- 客户端存储令牌哈希值
- 服务器端验证令牌
- 使用 SQLite 存储令牌配置

**局限性**:
- 简单防护机制，适合小型团队内部使用
- 建议部署在内部网络或使用 HTTPS
- 不适合高安全要求的场景

**改进方向**:
- 服务端验证（而非客户端）
- 使用 HTTPS 加密传输
- 考虑 JWT 或 Session 机制

**经验总结**:
根据实际需求选择合适的安全级别。简单令牌保护适合快速开发和小型团队，但不适合敏感数据保护。

---

## API 设计经验

### 11. RESTful API 设计
**端点设计**:
```
列管理
GET    /api/columns
POST   /api/columns
PUT    /api/columns/:id
DELETE /api/columns/:id

任务管理
GET    /api/tasks
GET    /api/tasks/:id
POST   /api/tasks
PUT    /api/tasks/:id
DELETE /api/tasks/:id
POST   /api/tasks/batch  # 批量更新
```

**批量更新优化**:
拖拽排序后，批量更新多个任务的 order 值，减少 HTTP 请求次数。

**经验总结**:
遵循 RESTful 规范，API 接口清晰易懂。批量操作接口可以优化性能。

---

## 错误处理经验

### 12. 统一错误处理
**前端错误处理**:
```typescript
try {
  await api.updateTask(taskId, updates);
} catch (error) {
  if (error.response?.status === 409) {
    // 并发冲突
    showNotification('数据已被修改，请刷新后重试');
  } else {
    showNotification('操作失败，请重试');
  }
}
```

**用户体验**:
- 使用 Toast 通知显示错误
- 提供明确的错误信息
- 给出恢复建议

**经验总结**:
良好的错误处理能提升用户体验，避免用户困惑。错误信息要清晰明确，便于理解。

---

## UI 布局优化经验

### 13. 信息密度与可读性平衡
**优化目标**: 提高信息密度，一屏显示更多内容

**优化措施**:
- 标题和副标题合并到同一行
- 日期放在负责人和优先级之间，充分利用空间
- 标签和更新时间放在同一行，左右对齐
- 移除重复的装饰性元素（如重复的日期图标）

**实现技巧**:
```css
/* 使用 flex 布局实现左右对齐 */
.task-footer-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}

/* 防止更新时间换行 */
.task-updated {
  white-space: nowrap;
}
```

**经验总结**:
在信息密度和可读性之间找平衡。紧凑布局适合专业用户，但要确保重要信息不被隐藏。使用 flex 布局可以轻松实现复杂的对齐需求。

---

### 14. 界面元素简化
**优化原则**: 去除冗余，保留核心

**具体实践**:
- 移除标题前的装饰性 ◆ 符号
- 统一使用 CSS 伪元素添加图标
- 删除重复的 emoji 图标

**代码示例**:
```css
/* 使用 CSS 伪元素添加图标 */
.task-due-date::before {
  content: '📅 ';
  filter: grayscale(100%);
}
```

**优点**:
- 减少代码冗余
- 更容易维护
- 样式统一可控

**经验总结**:
界面元素要精简，避免过度装饰。每个元素都应该有明确的作用。使用 CSS 伪元素可以统一管理图标样式。

---

## 项目维护经验

### 15. 模态框交互设计
**问题背景**: 用户在填写任务表单时，误点击模态框外的遮罩层导致表单关闭，数据丢失

**解决方案**:
- 移除点击遮罩层关闭模态框的功能
- 用户必须显式点击取消或关闭按钮才能关闭

**代码示例**:
```tsx
// TaskModal.tsx - 不监听遮罩层点击事件
<div className="modal-overlay">
  <div className="modal-content">
    {/* 只有点击取消或X按钮才能关闭 */}
  </div>
</div>
```

**经验总结**:
对于包含用户输入的表单模态框，应避免点击外部关闭，防止数据意外丢失。重要的操作应要求用户显式确认。

---

### 16. 拖拽到空容器处理
**问题背景**: 当列中没有任务时，拖拽区域高度为0，无法将任务拖入空列

**解决方案**:
```css
.column-content {
  min-height: 100px; /* 确保空列也有拖拽区域 */
}
```

**经验总结**:
拖拽功能需要考虑边界情况，如空容器。为空容器设置最小高度，确保拖拽目标区域始终可用。

---

### 17. 任务复制功能设计
**需求背景**: 用户需要基于现有任务创建相似任务

**实现方式**:
- 后端添加 `/api/tasks/:id/duplicate` 端点
- 复制任务所有字段，标题添加 '(副本)' 后缀
- 新任务放置在同一列末尾

**代码示例**:
```javascript
// 复制任务
app.post('/api/tasks/:id/duplicate', (req, res) => {
  const original = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  const newTask = {
    ...original,
    id: generateId(),
    title: original.title + ' (副本)',
    order: getMaxOrder(original.columnId) + 1
  };
  // 插入新任务
});
```

**经验总结**:
复制功能要考虑唯一标识符、标题区分、位置安排等细节。明确复制后的任务状态，避免与原任务混淆。

---

### 18. 及时清理废弃文件
**问题背景**: 项目从 JSON Server 迁移到 SQLite 后，遗留了 db.json 文件

**清理内容**:
- 删除废弃的 db.json 文件
- 移除 package.json 中未使用的 json-server 脚本
- 更新文档中的相关引用

**清理步骤**:
1. 使用 `git status` 检查未跟踪的文件
2. 使用搜索工具查找所有引用
3. 删除文件和代码
4. 更新相关文档

**注意事项**:
- 确认文件确实不再使用
- 检查是否有其他文件依赖
- 更新所有相关文档

**经验总结**:
及时清理废弃文件和代码，保持项目整洁。遗留的文件会误导新开发者，增加维护成本。

---

### 19. 文档完整性
**问题发现**: README 中提到要修改默认令牌，但没写明默认令牌是什么

**改进措施**:
- 在安全说明中明确标注默认令牌为 `123456`
- 添加修改令牌的操作指引
- 在多个文档中保持信息一致

**文档规范**:
- 重要信息要明确具体，不要模糊
- 提供操作指引，而不仅仅是建议
- 保持各文档信息一致性

**经验总结**:
文档要为用户着想，提供完整、具体、可操作的信息。模糊的说明会造成用户困惑。

---

### 20. Docker 容器命名
**优化前**: `docker run -p 80:80 kanban-board`
**优化后**: `docker run --name kanban -p 80:80 kanban-board`

**命名的好处**:
- 易于管理：`docker start kanban`、`docker stop kanban`
- 易于识别：不需要记住容器 ID
- 方便调试：`docker logs kanban`
- 避免冲突：防止同时运行多个同名容器

**常用管理命令**:
```bash
docker start kanban      # 启动容器
docker stop kanban       # 停止容器
docker rm kanban         # 删除容器
docker logs kanban       # 查看日志
```

**经验总结**:
在生产环境中使用命名容器，便于管理和维护。养成良好的容器命名习惯。

---

## 数据库迁移经验

### 21. 零停机数据库迁移
**核心原则**: 新增表/字段必须向后兼容，保证现有数据不受影响

**实现方式**:
```javascript
// 使用 IF NOT EXISTS 创建新表
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

// 使用 IF NOT EXISTS 添加索引
db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_taskId ON comments(taskId)`);

// 新增列时使用 try-catch 处理已存在的情况
try {
  db.exec('ALTER TABLE settings ADD COLUMN theme TEXT DEFAULT \'dark-neon\'');
} catch (e) {
  // Column already exists, ignore error
}
```

**迁移步骤**:
1. 编写向后兼容的数据库变更代码（使用 `IF NOT EXISTS`）
2. 本地测试验证现有数据保留
3. 部署新版代码
4. 重启服务器自动执行迁移
5. 验证新功能正常

**验证清单**:
- [ ] 现有任务数据完整保留
- [ ] 现有列配置完整保留
- [ ] 令牌/设置完整保留
- [ ] 新表/字段正确创建
- [ ] 应用启动无错误

**备份策略**:
```bash
# 迁移前备份
cp server/data/kanban.db server/data/kanban.db.backup.$(date +%Y%m%d)

# 如果迁移失败，可以回滚
cp server/data/kanban.db.backup.xxx server/data/kanban.db
```

**经验总结**:
- 永远使用 `IF NOT EXISTS` 创建新表和索引
- 新增列时包装在 try-catch 中
- 迁移前务必备份数据库
- 避免删除或重命名现有表/字段（破坏性变更）
- 测试时验证现有数据完整性

---

## 总结

这个看板系统项目展示了如何从原型开发过渡到生产环境：

1. **技术选型**: 选择合适的库和工具，平衡功能、性能和维护性
2. **架构设计**: 模块化设计，便于扩展和维护
3. **并发控制**: 简单有效的乐观锁机制
4. **UI/UX**: 现代化设计风格，优化信息密度
5. **部署**: Docker 容器化，简化部署流程
6. **安全**: 根据需求选择合适的安全级别

**核心经验**:
- 快速原型 → 稳定生产的平滑过渡
- 保持 API 接口稳定，减少前端改动
- 注重用户体验，持续优化
- 选择合适的技术方案，不过度设计

---

最后更新: 2026-04-22
更新人: Claude Code

---

## 头部布局优化经验

### 22. 避免增加页面头高度
**问题背景**: 用户反馈页面头太高，不能接受增加新行

**错误方案**:
```
┌─────────────────────────────────────┐
│ 标题            [主题] [令牌]       │  ← 第一行
│ [筛选] [搜索...]                    │  ← 第二行（新增）
└─────────────────────────────────────┘
```

**正确方案**: 保持单行，优化元素排列
```
┌─────────────────────────────────────┐
│ 标题 │ [筛选] [搜索] │ [设置▼]     │
└─────────────────────────────────────┘
```

**经验总结**:
页面垂直空间珍贵，头部应尽量紧凑。优化布局时优先考虑合并、精简，而不是增加行数。

---

### 23. 设置菜单合并设计
**需求背景**: 头部控件过多，需要精简

**设计方案**:
- 将低频操作（主题切换、修改令牌）合并到设置菜单
- 高频操作（筛选、搜索）保留在显眼位置
- 设置菜单下拉显示所有选项

**代码结构**:
```tsx
// SettingsMenu 包含主题选择和令牌修改
<div className="settings-dropdown">
  <div className="settings-dropdown-header">主题</div>
  {themeOptions.map(...)}
  <div className="settings-divider" />
  <button onClick={onChangeToken}>修改令牌</button>
</div>
```

**经验总结**:
按使用频率对控件分类：高频操作放显眼位置，低频操作收起到菜单。减少视觉噪音，提升用户体验。

---

### 24. 任务筛选功能实现
**需求背景**: 了解团队成员是否及时更新任务

**实现方式**:
1. 添加 StaleFilter 类型
2. 基于 updatedAt 字段筛选
3. 下拉菜单提供筛选选项

**代码示例**:
```typescript
const filteredTasks = useMemo(() => {
  if (staleFilter === 'all') return tasks;

  const daysMap = { '1day': 1, '3days': 3, '5days': 5 };
  const cutoff = Date.now() - daysMap[staleFilter] * 24 * 60 * 60 * 1000;

  return tasks.filter(task =>
    new Date(task.updatedAt).getTime() < cutoff
  );
}, [tasks, staleFilter]);
```

**经验总结**:
筛选功能基于现有数据字段实现，无需修改数据库。使用 useMemo 优化性能，避免不必要的重新计算。

---
更新人: Claude Code

---

## 专业银行主题设计经验

### 25. 企业级主题配色
**设计背景**: 从赛博朋克风格转为专业银行风格

**主题方案**:
1. **深蓝金** (默认): 深蓝 + 金色强调色 - 奢华财富管理感
2. **科技蓝**: 现代数字化银行美学
3. **森林绿**: 稳健可持续发展感

**经验总结**:
企业级应用需要专业、信任感的设计。避免过于花哨的配色，选择稳重的色调组合。

---

### 26. IBM Plex 字体系统
**选择理由**:
- IBM 官方设计，金融行业标准
- 开源免费，支持多语言
- 提供 Sans 和 Mono 两种风格

**经验总结**:
字体选择影响整体专业感。企业级应用应选择被广泛认可的字体家族。

---

### 27. 移除 Emoji 改用 SVG 图标
**问题背景**: Emoji 在不同系统显示不一致，不够专业

**替换方案**:
- 搜索图标: SVG 内联
- 用户头像: 首字母缩写 + CSS 样式
- 评论图标: SVG 路径

**经验总结**:
企业级 UI 应避免使用 Emoji，改用统一的图标系统。SVG 图标可控性更强，支持主题适配。

---

### 28. 取消 UPPERCASE 样式
**问题背景**: 全大写 + 字母间距过于张扬，不适合银行场景

**经验总结**:
UI 文案应自然可读。全大写适合强调少量内容，但大量使用会造成阅读疲劳。企业级应用应选择更温和的排版方式。

---

## AI 服务开发经验

### 29. 中文 URL 编码处理
**问题背景**: AI 服务调用后端 API 时，负责人名称包含中文导致编码错误

**解决方案**:
```python
import urllib.parse
query_string = urllib.parse.urlencode(params, encoding='utf-8')
```

**经验总结**:
处理中文参数时，务必使用标准库的编码函数。手动拼接字符串容易遗漏编码步骤。

---

### 30. Docker 路径解析
**问题背景**: 报告下载功能在 Docker 中返回 404

**解决方案**:
```python
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DOWNLOADS_DIR = PROJECT_ROOT / "server" / "data" / "downloads"
```

**经验总结**:
Docker 环境的文件路径与本地开发不同。使用相对路径计算或环境变量配置。

---

## AI 导航功能开发经验

### 31. AI 触发前端导航
**需求背景**: 用户希望通过 AI 对话框直接打开页面，如"打开设置"、"查看某个任务"

**实现方案**:
1. 后端：创建 NavigateToPageTool 工具，返回 JSON 格式的导航指令
2. 前端：AIChat 组件解析 AI 响应中的 navigate 字段，调用回调函数
3. App.tsx：处理导航回调，切换视图或打开弹窗

**关键代码**:
```python
# NavigateToPageTool 返回结构
return ToolResult(
    content=json.dumps({
        "action": "navigate",
        "page": "settings",  # 或 board, task
        "taskId": "xxx"  # 可选
    })
)
```

```tsx
// 前端处理导航响应
if (response.navigate && onNavigate) {
  onNavigate(response.navigate.page, response.navigate);
}
```

**经验总结**:
- AI 工具返回的结构化数据需要通过额外字段（如 navigate）传递给前端
- 不能仅依赖 AI 文本响应，前端无法可靠解析自然语言的导航意图
- 工具调用结果需要从 messages 中提取，而非 final_response

---

### 32. Docker 构建缓存问题
**问题背景**: 修改代码后 Docker 构建仍使用旧缓存

**解决方案**:
```bash
# 清理 Docker 构建缓存
docker builder prune -af

# 删除旧镜像强制重建
docker rmi kanban-board

# 重新构建
./build-docker.sh
```

**经验总结**:
Docker 多阶段构建会缓存各层。当代码更改未触发缓存失效时，需要手动清理缓存或删除镜像。

---

最后更新: 2026-06-29

---

## tiktoken 离线环境问题

### 33. tiktoken 缓存目录持久化
**问题背景**: 内网环境运行 Docker 容器时，AI 服务报错 `max retries exceeded with url: /encodings/cl100k_base.tiktoken`

**根本原因**:
1. tiktoken 首次使用需要从 `openaipublic.blob.core.windows.net` 下载编码文件
2. Docker 构建时预下载到临时目录 `/tmp/data-gym-cache/`
3. 容器运行时临时目录被清空或路径不同，导致缓存文件丢失

**tiktoken 缓存优先级**:
```python
# tiktoken/load.py
if "TIKTOKEN_CACHE_DIR" in os.environ:
    cache_dir = os.environ["TIKTOKEN_CACHE_DIR"]
elif "DATA_GYM_CACHE_DIR" in os.environ:
    cache_dir = os.environ["DATA_GYM_CACHE_DIR"]
else:
    cache_dir = os.path.join(tempfile.gettempdir(), "data-gym-cache")  # 临时目录
```

**解决方案**:
```dockerfile
# ai-builder 阶段：设置固定缓存目录
ENV TIKTOKEN_CACHE_DIR=/app/tiktoken_cache

# 预下载编码文件到固定目录
RUN mkdir -p /app/tiktoken_cache && \
    python -c "import tiktoken; tiktoken.get_encoding('cl100k_base')"

# 最终镜像：复制缓存目录并设置环境变量
COPY --from=ai-builder /app/tiktoken_cache /app/tiktoken_cache
ENV TIKTOKEN_CACHE_DIR=/app/tiktoken_cache
```

**关键要点**:
- 构建阶段和运行阶段使用相同的缓存目录路径
- 使用 `COPY --from=builder` 将缓存文件从构建镜像复制到最终镜像
- 设置 `TIKTOKEN_CACHE_DIR` 环境变量确保 tiktoken 找到缓存文件

**经验总结**:
- Docker 构建时下载的文件默认存放在临时目录，容器运行时可能丢失
- 需要持久化的缓存文件必须：设置固定路径 + 显式复制到最终镜像 + 设置环境变量
- 其他需要网络下载的库（如 sentence-transformers）也有类似问题

---

### 34. nginx 403 forbidden 与 volume 挂载权限问题
**问题背景**: Docker 容器内 AI 生成的报告文件无法下载，nginx 返回 403 forbidden

**根本原因**:
1. nginx 默认以 `nginx` 用户运行（非 root）
2. bind mount 挂载的目录继承宿主机权限，容器内 nginx 用户可能无法读取
3. 即便容器内创建的目录，文件默认权限 `rw-r--r--` (644) 对 group/other 可读，但目录需要 `rwx` 才能进入

**解决方案**:
```dockerfile
# 方案一：使用不挂载的临时目录（推荐）
# 启动脚本中创建目录并设置权限
RUN echo 'mkdir -p /tmp/downloads && chmod 755 /tmp/downloads' >> /app/start.sh

# Python 代码中设置文件权限
import os
filepath = DOWNLOADS_DIR / filename
doc.save(str(filepath))
os.chmod(filepath, 0o644)  # 让 nginx 用户可读
```

```dockerfile
# 方案二：让 nginx 以 root 运行（简单但不安全）
# 在 nginx.conf 最前面添加
user root;
```

**nginx 用户权限要点**:
- nginx 默认以 `nginx` 用户 (UID 101) 运行
- 目录权限需要 `755` (rwxr-xr-x) 才能让 nginx 进入并读取
- 文件权限需要 `644` (rw-r--r--) 才能让 nginx 读取
- bind mount 目录继承宿主机权限，需要宿主机 `chmod 755`

**经验总结**:
- 涉及文件下载的目录不要挂载到宿主机，使用容器内临时目录
- 启动脚本中创建目录并设置 `chmod 755`
- Python 生成文件后调用 `os.chmod(filepath, 0o644)` 确保可读

---

### 36. 长耗时任务用后台任务 + 立即返回
**需求背景**: 手动补发通知邮件，但报告生成（AI agent）可能耗时数分钟

**问题**: 若在 FastAPI 端点里 `await agent.run(...)` 同步等待，HTTP 请求会被占住几分钟，前端虽可继续用（fetch 非阻塞），但体验差且浪费连接

**解决方案**:
```python
# 后台执行，接口立即返回
async def _run_reminder():
    try:
        await agent.run(REMINDER_GOAL, session_id=...)
    except Exception as e:
        print(f"失败: {e}")

asyncio.create_task(_run_reminder())
return {"success": True}
```

**经验总结**:
- 耗时数分钟的任务用 `asyncio.create_task` 后台执行，接口毫秒级返回
- 后台任务必须 try/except + 日志，否则静默失败无法排查（本需求"没发出邮件"正是要解决此痛点）
- 共享提示词提取为常量（`REMINDER_GOAL`），定时与手动触发共用，避免两处文案漂移
- 测试无 SDK/API Key 环境时，用 AsyncMock 替换 agent + 注入假模块（`sys.modules`），直接 await 端点函数而非走 HTTP/TestClient（后者后台任务在请求结束会被取消，时序不可控）

---

### 35. AI 导航影响其他用户的问题
**问题背景**: Docker 多用户环境下，一个用户通过 AI 打开任务卡时，其他用户的页面也会打开任务卡

**根本原因**:
1. `sessionId` 使用 `Date.now()` 生成，理论上每个用户不同
2. 但在极端情况下（同一毫秒内打开页面），可能产生相同的 sessionId
3. 更常见的原因：Docker 镜像没有重新构建，或浏览器缓存了旧的 JavaScript

**修复方案**:
```tsx
// 增强会话ID唯一性 - 时间戳 + 随机数
const [sessionId] = useState(() => `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

// 添加调试日志
if (response.navigate) {
  console.log('[AIChat] Navigate response:', {
    responseSessionId: response.session_id,
    currentSessionId: sessionId,
    match: response.session_id === sessionId
  });
  if (response.session_id === sessionId && onNavigate) {
    onNavigate(response.navigate.page, response.navigate);
  }
}
```

**后端日志**:
```python
# 记录请求和响应
print(f"[AI Service] Chat request - session_id: {request.session_id}")
if navigate_action:
    print(f"[AI Service] Navigate action - session_id: {request.session_id}")
```

**验证步骤**:
1. 重新构建 Docker 镜像：`./build-docker.sh`
2. 清除浏览器缓存或使用无痕模式测试
3. 检查浏览器控制台日志，确认每个用户的 sessionId 不同
4. 检查后端日志，确认 session_id 正确传递和返回

**经验总结**:
- 涉及多用户隔离的功能，必须确保 session ID 的唯一性
- 使用 `时间戳 + 随机数` 组合生成唯一标识
- 添加调试日志帮助定位问题
- Docker 部署时确保镜像已更新

---
