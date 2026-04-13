# AGENTS.md - 项目上下文文件

> **  经验教训**：所有关键警告和最佳实践请参阅 [lessons.md](lessons.md)
> **🔧 编程规范**：规范化开发流程、系统设计决策、测试验证要求请遵守 [docs/programmer_skill.md](docs/programmer_skill.md)

## 项目概述

这是一个**看板系统(Kanban Board)**项目，为小型团队（1-5人）提供简单实用的任务管理系统。

**项目状态**: 已完成核心功能开发，支持本地开发和 Docker 部署

**核心特性**:
- 拖拽式任务管理
- 多列状态流转（待办、进行中、审核、已完成）
- 任务详情管理（标题、描述、负责人、优先级、截止日期、标签、进度）
- 自定义列管理
- 简单令牌保护
- 任务搜索功能
- 实时更新时间显示
- Docker 容器化部署

## 目录结构

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
│   │   └── ConfirmDialog/ # 确认对话框
│   ├── hooks/             # 自定义 Hooks
│   │   ├── useColumns.ts  # 列管理
│   │   ├── useTasks.ts    # 任务管理
│   │   └── useDragDrop.ts # 拖拽逻辑
│   ├── services/          # API 服务
│   ├── types/             # TypeScript 类型定义
│   └── styles/            # 全局样式
├── server/                 # 后端源码
│   ├── server.js          # Express 服务器
│   └── db.js              # SQLite 数据库初始化
├── docs/                   # 文档目录
│   └── superpowers/specs/ # 设计文档
├── Dockerfile              # Docker 配置
└── README.md               # 项目说明文档
```

## 技术栈

| 类别 | 技术选型 |
|------|---------|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 5 |
| 拖拽库 | @dnd-kit/core + @dnd-kit/sortable |
| HTTP客户端 | Axios |
| 后端服务 | Express 4 |
| 数据库 | SQLite (better-sqlite3) |
| 容器化 | Docker |

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

## 开发命令

### 前端开发
```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview

# 代码检查
npm run lint
```

### 后端开发
```bash
# 安装依赖
cd server && npm install

# 启动服务器
npm start
```

### Docker 部署
```bash
# 构建镜像
docker build -t kanban-board .

# 运行容器
docker run --name kanban -p 80:80 kanban-board
```

## API 端点

服务器运行在端口 3001，提供以下 REST API：

### 列管理
- `GET /api/columns` - 获取所有列
- `POST /api/columns` - 创建新列
- `PUT /api/columns/:id` - 更新列
- `DELETE /api/columns/:id` - 删除列

### 任务管理
- `GET /api/tasks` - 获取所有任务
- `GET /api/tasks/:id` - 获取单个任务
- `POST /api/tasks` - 创建任务
- `PUT /api/tasks/:id` - 更新任务（支持乐观锁）
- `DELETE /api/tasks/:id` - 删除任务
- `POST /api/tasks/batch` - 批量更新任务（拖拽排序）

### 设置管理
- `GET /api/settings` - 获取设置
- `PUT /api/settings` - 更新设置

## 功能说明

### 令牌保护
- 首次访问时设置令牌
- 后续访问需输入令牌验证
- 令牌存储在 SQLite 数据库
- 支持令牌修改功能

### 任务优先级
- **高优先级** - 红色 (#ef4444)
- **中优先级** - 黄色 (#f59e0b)
- **低优先级** - 绿色 (#10b981)

### 任务进度
- 支持 0-100 进度显示
- 进度描述文字（progressText）
- 在卡片上直观展示进度

### 拖拽功能
- 支持列内拖拽排序
- 支持跨列拖拽移动
- 实时保存位置信息
- 批量更新优化性能

### 并发控制
- 使用乐观锁机制
- 基于 `updatedAt` 字段检测冲突
- 冲突时提示用户刷新数据

### 搜索功能
- 支持搜索任务标题、描述
- 支持搜索负责人
- 支持搜索标签

## 数据持久化

- **开发环境**: 数据存储在 `server/data/kanban.db` (SQLite)
- **Docker 环境**: 数据存储在容器内 `/app/server/data/kanban.db`
- 建议定期备份 SQLite 数据库文件

## 开发规范

### 组件开发
- 每个组件独立目录，包含 `.tsx`、`.css`、`index.ts`
- 使用 TypeScript 类型定义
- CSS 类名使用 kebab-case

### API 调用
- 统一使用 `services/api.ts` 封装
- 使用 async/await 处理异步
- 错误统一处理

### 状态管理
- 使用自定义 Hooks 管理数据
- 组件内部使用 useState 管理本地状态

## 注意事项

- 令牌保护为简单防护机制，适合小型团队内部使用
- 并发控制采用乐观锁策略
- 默认令牌为 `123456`，生产环境请修改
- 数据库使用 WAL 模式提升并发性能

## 扩展功能

未来可考虑添加：
- 任务评论功能
- 文件附件上传
- 任务时间追踪
- 数据统计和报表
- 多看板支持
- 实时协作（WebSocket）


## Session Workflow

**会话开始时必须执行**：
1. 读取 `progress.txt` 文件，了解项目当前进展
2. 审查 `lessons.md` 文件，检查是否有错误需要纠正

**功能更新后**：
1. 更新 `progress.txt`，记录新的进展
2. 如有新的学习心得，更新 `lessons.md`
