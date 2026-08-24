# AGENTS.md

本文件为 OpenCode 在本仓库中工作时提供指引。

## 项目概述

一个面向小团队（1-5 人）的看板系统，支持拖拽任务管理、SQLite 持久化、AI 助手以及简单的基于令牌的访问控制。采用专业银行风格设计，使用 IBM Plex 字体。

## 架构

### 前端（React + TypeScript + Vite）
- **入口**：`src/main.tsx` → `src/App.tsx`
- **状态管理**：自定义 Hook，位于 `src/hooks/`（useTasks、useColumns）
- **组件**：每个组件拥有独立目录，包含 `.tsx`、`.css`、`index.ts`
- **API 层**：`src/services/api.ts` - 集中式 Axios 客户端，含冲突错误处理
- **类型**：`src/types/index.ts` - 共享的 TypeScript 接口
- **样式**：使用 CSS 自定义属性实现主题化，字体为 IBM Plex 系列

### 后端（Express + better-sqlite3）
- **入口**：`server/server.js`
- **数据库**：`server/db.js` - SQLite 启用 WAL 模式，自动初始化表结构
- **端口**：3001

### AI 服务（FastAPI + Harness SDK）
- **入口**：`ai-service/main.py`
- **端口**：3002
- **SDK 路径**：`/data/harness/packages/sdk`（本地开发）
- **记忆**：`server/data/MEMORY.md` - 与数据库共享，以保证 Docker 兼容性
- **功能**：自然语言任务查询、带容量限制的自动记忆、页面导航
- **URL 编码**：API 调用中使用 `urllib.parse.urlencode()` 支持中文字符
- **工具**：`GetTaskDictionaryTool`、`QueryTasksTool`、`ManageTaskTool`、`GenerateReportTool`、`NavigateToPageTool`
- **技能**：`ai-service/skills/kanban.md` - 定义可用工具与交互模式

### 关键设计模式
1. **乐观锁**：任务使用 `updatedAt` 进行冲突检测（返回 409）
2. **批量更新**：拖拽使用 `/api/tasks/batch` 实现原子化重排序
3. **组件结构**：`components/ComponentName/{ComponentName.tsx, ComponentName.css, index.ts}`
4. **记忆管理**：Harness SDK 配合 `MemoryScoringConfig`（上限 3000 token，自动归档至 `MEMORY_ARCHIVE.md`）

## 常用命令

```bash
# 开发（需要三个终端）
npm run dev                           # 前端开发服务器（端口 5173）
cd server && npm start                # 后端服务器（端口 3001）
cd ai-service && python main.py       # AI 服务（端口 3002，可选）

# 构建与部署
./build-docker.sh                     # 构建带 Harness SDK 的 Docker 镜像
./run-docker.sh                       # 运行容器（从 .env 读取 DOCKER_PORT）

# 代码质量
npm run lint                          # ESLint 检查
npm run build                         # 生产构建
```

## 数据库迁移模式

始终使用向后兼容的迁移方式：

```javascript
// 创建新表
CREATE TABLE IF NOT EXISTS table_name (...)

// 添加列（带错误处理）
try {
  db.exec('ALTER TABLE table ADD COLUMN col TEXT DEFAULT \'value\'');
} catch (e) { /* 列已存在 */ }

// 创建索引
CREATE INDEX IF NOT EXISTS idx_name ON table(column)
```

## 会话工作流（必选）

每次会话开始时：
1. 阅读 `progress.txt` 了解当前项目状态
2. 查阅 `lessons.md` 获取相关架构模式与历史决策

功能变更完成后：
1. 在 `progress.txt` 中更新新功能及提交引用
2. 如有需要，将经验记录到 `lessons.md`（尤其是 UI/UX 决策与缺陷修复）

## 数据模型

完整定义见 `src/types/index.ts`。关键实体：
- **Column**：id、title、order
- **Task**：id、title、description、assignee、priority、dueDate、tags、columnId、order、progress、progressText、createdAt、updatedAt
- **Comment**：id、taskId、author、content、createdAt、updatedAt
- **Settings**：token、theme
- **Theme**：'navy-gold' | 'tech-blue' | 'forest-green'
- **StaleFilter**：'all' | '1day' | '3days' | '5days'

## API 端点

- 列：`GET/POST /api/columns`、`PUT/DELETE /api/columns/:id`
- 任务：`GET/POST /api/tasks`、`PUT/DELETE /api/tasks/:id`、`POST /api/tasks/batch`、`POST /api/tasks/:id/duplicate`
- 评论：`GET/POST /api/tasks/:id/comments`、`PUT/DELETE /api/comments/:id`
- 设置：`GET/PUT /api/settings`
- 导出：`GET /api/export/csv` - 将所有任务及评论下载为 CSV
- AI：`GET /api/ai/dictionary`、`GET /api/ai/query`、`POST /api/ai/chat`

## 主题

提供三套专业银行风格主题：
- **Navy Gold**（默认）：深蓝 + 金色点缀 - 奢华财富管理质感
- **Tech Blue**：现代数字银行风格
- **Forest Green**：可持续、稳健的视觉感受

字体系统使用 IBM Plex 系列（金融行业企业级标准）：
- 显示/正文：IBM Plex Sans
- 等宽/数字：IBM Plex Mono

## 关键约束

1. **令牌保护**为简单机制，仅供内部使用 - 默认令牌为 `123456`
2. 任务更新采用**乐观锁** - 注意处理 409 冲突
3. 已启用 SQLite **WAL 模式**以提升并发能力
4. **数据库路径**：`server/data/kanban.db`（开发）、`/app/server/data/kanban.db`（Docker）
5. **记忆路径**：`server/data/MEMORY.md` - 本地开发与 Docker 共享
6. **Harness SDK**：AI 服务开发需在 `/data/harness/packages/sdk`
7. **中文编码**：含中文字符的 URL 参数使用 `urllib.parse.urlencode(encoding='utf-8')`
8. **SMTP 配置**：同时支持认证（端口 465/587）与非认证（端口 25）SMTP 服务器。内部无认证 SMTP 设置 `SMTP_REQUIRE_AUTH=false`。

## AI 响应结构

`/api/ai/chat` 端点返回带可选 `navigate` 字段的 `ChatResponse`：

```typescript
interface ChatResponse {
  content: string;      // AI 文本响应
  session_id: string;
  navigate?: {          // 可选导航动作
    action: "navigate";
    page: "settings" | "board" | "task";
    taskId?: string;    // 仅任务导航时使用
  };
}
```

前端 `AIChat` 组件在存在 `navigate` 字段时调用 `onNavigate(page, params)`。

## Docker 开发

```bash
# 若改动未生效，清理构建缓存
docker builder prune -af

# 强制无缓存重建
docker rmi kanban-board && ./build-docker.sh
```
