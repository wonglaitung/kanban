# 看板系统 (Kanban Board)

一个简洁实用的看板系统，用于小型团队（1-5人）管理组内任务。支持拖拽交互、任务详情管理、AI智能助手和简单的令牌保护。

## 功能特性

- **拖拽式任务管理** - 流畅的拖拽体验，支持跨列移动和列内排序
- **多列状态流转** - 待办、进行中、审核、已完成
- **任务详情管理** - 标题、描述、负责人、优先级、截止日期、标签、进度
- **任务评论讨论** - 支持主管追问和负责人回复，任务卡片显示评论数量
- **自定义列管理** - 添加、编辑、删除列
- **令牌保护** - 简单的访问控制，保护看板数据
- **AI 智能助手** - 自然语言查询和分析任务数据，自动记忆用户偏好
- **记忆容量管理** - 自动归档低重要性记忆，支持最多约50条记忆
- **实时更新时间** - 显示每个任务的最后更新时间
- **搜索功能** - 快速搜索任务、负责人、标签
- **响应式设计** - 适配不同屏幕尺寸
- **多主题支持** - 暗色霓虹、浅色、纯黑三种主题

## 技术栈

| 类别 | 技术选型 |
|------|---------|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| 拖拽库 | @dnd-kit/core + @dnd-kit/sortable |
| HTTP客户端 | Axios |
| Markdown渲染 | react-markdown + remark-gfm |
| 后端服务 | Express + better-sqlite3 |
| AI服务 | FastAPI + Harness SDK |
| 数据库 | SQLite |
| 容器化 | Docker |

## 界面展示

系统提供现代化的赛博朋克风格界面，支持拖拽交互、任务搜索和多列管理。

![看板界面](assets/layout.jpg)

看板主界面展示所有任务列和任务卡片，支持拖拽任务在列之间移动，点击任务卡片可编辑详情。

## 快速开始

### 本地开发

1. **安装依赖**
   ```bash
   # 前端依赖
   npm install
   
   # 后端依赖
   cd server && npm install && cd ..
   
   # AI 服务依赖（可选，需要 AI 功能时安装）
   cd ai-service && pip install -r requirements.txt && cd ..
   
   # Harness SDK（AI 服务需要）
   pip install -e /data/harness/packages/sdk
   ```

2. **配置 AI 服务（可选）**
   
   创建 `.env` 文件：
   ```bash
   cp .env.example .env
   ```
   
   编辑 `.env`，配置 API Key：
   ```
   API_KEY=your-api-key
   API_BASE_URL=https://your-api-endpoint/v2
   AI_MODEL=your-model-name
   ```

3. **启动开发服务器**
   
   终端1（前端）：
   ```bash
   npm run dev
   ```
   
   终端2（后端）：
   ```bash
   cd server && npm start
   ```
   
   终端3（AI 服务，可选）：
   ```bash
   cd ai-service && python main.py
   ```

4. **访问应用**
   
   打开浏览器访问 `http://localhost:5173`
   
   点击右下角 AI 图标可与智能助手对话（需启动 AI 服务）

### Docker 部署

1. **配置环境变量**

   复制并编辑 `.env` 文件：
   ```bash
   cp .env.example .env
   ```

   编辑 `.env` 文件，配置 AI 服务和端口：
   ```
   DOCKER_PORT=8080
   API_KEY=your-api-key
   API_BASE_URL=https://your-api-endpoint/v2
   AI_MODEL=your-model-name
   ```

2. **构建镜像**
   ```bash
   ./build-docker.sh
   ```

3. **运行容器**
   ```bash
   ./run-docker.sh
   ```

   脚本会自动：
   - 从 `.env` 读取 `DOCKER_PORT`（默认 80）
   - 使用项目目录 `server/data/` 作为数据库（与本地开发共用）

4. **访问应用**

   打开浏览器访问 `http://localhost:8080`（根据 `DOCKER_PORT` 配置）

   点击右下角 AI 图标可与智能助手对话

### 数据备份

数据库文件位于 `server/data/kanban.db`，备份和恢复：

```bash
# 备份
cp server/data/kanban.db server/data/kanban-backup-$(date +%Y%m%d).db

# 恢复
cp server/data/kanban-backup-20240101.db server/data/kanban.db
```

## 项目结构

```
/data/kanban/
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   │   ├── Board/         # 看板主容器
│   │   ├── Column/        # 列组件
│   │   ├── TaskCard/      # 任务卡片
│   │   ├── TaskModal/     # 任务编辑弹窗
│   │   ├── ColumnModal/   # 列编辑弹窗
│   │   ├── TokenModal/    # 令牌输入弹窗
│   │   └── AIChat/        # AI 聊天组件
│   ├── hooks/             # 自定义 Hooks
│   ├── services/          # API 服务
│   ├── types/             # TypeScript 类型定义
│   └── styles/            # 全局样式
├── server/                 # 后端源码
│   ├── server.js          # Express 服务器
│   └── db.js              # 数据库初始化
├── ai-service/             # AI 服务（Python FastAPI）
│   ├── main.py            # FastAPI 主入口 + Harness SDK
│   ├── requirements.txt   # Python 依赖
│   └── config/
│       └── dictionary.py  # 任务字段字典定义
├── docs/                   # 文档
├── Dockerfile              # Docker 配置
├── build-docker.sh         # Docker 构建脚本
├── run-docker.sh           # Docker 运行脚本
└── package.json            # 项目配置
```

## 数据模型

### Column (列)
```typescript
interface Column {
  id: string;
  title: string;
  order: number;
}
```

### Task (任务)
```typescript
interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;
  priority: 'high' | 'medium' | 'low';
  dueDate: string;
  tags: string[];
  columnId: string;
  order: number;
  progress: number;        // 0-100
  progressText: string;    // 进度描述文字
  createdAt: string;
  updatedAt: string;
}
```

### Settings (设置)
```typescript
interface Settings {
  token: string;  // 访问令牌
}
```

### Comment (评论)
```typescript
interface Comment {
  id: string;
  taskId: string;      // 关联任务ID
  author: string;      // 评论人
  content: string;     // 评论内容
  createdAt: string;   // 创建时间
  updatedAt: string;   // 更新时间
}
```

## API 端点

### 列管理
- `GET /api/columns` - 获取所有列
- `POST /api/columns` - 创建新列
- `PUT /api/columns/:id` - 更新列
- `DELETE /api/columns/:id` - 删除列

### 任务管理
- `GET /api/tasks` - 获取所有任务
- `GET /api/tasks/:id` - 获取单个任务
- `POST /api/tasks` - 创建任务
- `PUT /api/tasks/:id` - 更新任务
- `DELETE /api/tasks/:id` - 删除任务
- `POST /api/tasks/batch` - 批量更新任务（拖拽排序）

### 设置管理
- `GET /api/settings` - 获取设置
- `PUT /api/settings` - 更新设置

### 评论管理
- `GET /api/tasks/:id/comments` - 获取任务的所有评论
- `POST /api/tasks/:id/comments` - 添加评论
- `PUT /api/comments/:id` - 更新评论
- `DELETE /api/comments/:id` - 删除评论

### AI 智能助手
- `GET /api/ai/dictionary` - 获取任务字段字典（供 AI 理解数据结构）
- `GET /api/ai/query` - 查询任务数据（支持 status、priority、assignee、overdue 等参数）
- `POST /api/ai/chat` - 多轮对话，自然语言查询和分析任务

### 导出功能
- `GET /api/export/csv` - 导出所有任务及评论为 CSV 文件

## AI 记忆系统

AI 服务使用 Harness SDK 的记忆系统：

- **MEMORY.md** - 存储长期记忆（用户偏好、项目约定等）
- **容量限制** - 约 3000 tokens（约 50 条记忆）
- **自动归档** - 超限时自动归档到 `MEMORY_ARCHIVE.md`
- **存储位置** - `server/data/MEMORY.md`（本地开发和 Docker 共用）

## 功能说明

### 令牌保护
- 首次访问时需要设置令牌
- 后续访问需输入令牌验证
- 可通过界面按钮修改令牌
- 令牌存储在服务器端 SQLite 数据库

### 任务优先级
- **高优先级** - 红色标识
- **中优先级** - 黄色标识
- **低优先级** - 绿色标识

### 拖拽功能
- 支持列内拖拽排序
- 支持跨列拖拽移动
- 实时保存位置信息

### 并发控制
- 使用乐观锁机制
- 基于 `updatedAt` 字段检测冲突
- 冲突时提示用户刷新数据

## 开发指南

### 本地开发环境要求
- Node.js >= 18
- npm >= 9
- Python >= 3.10（AI 服务需要）
- Harness SDK（位于 `/data/harness/packages/sdk`）

### 可用脚本
- `npm run dev` - 启动开发服务器
- `npm run build` - 构建生产版本
- `npm run preview` - 预览生产构建
- `npm run lint` - 运行代码检查
- `./build-docker.sh` - 构建 Docker 镜像
- `./run-docker.sh` - 运行 Docker 容器

## 数据存储位置

- 本地开发和 Docker：共用 `server/data/kanban.db`
- 数据在两种运行方式间互通
- AI 记忆文件 `MEMORY.md` 同样共用

## 安全说明

- 令牌保护为简单防护机制，适合小型团队内部使用
- 建议部署在内部网络或使用 HTTPS
- 默认令牌为 `123456`，生产环境请修改
- 登录后可通过界面右上角的"修改令牌"按钮更改令牌

## 许可证

MIT License
