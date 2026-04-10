# 看板系统设计文档

## 项目概述

设计一个简单实用的看板系统，用于小型团队（1-5人）管理组内任务。支持拖拽交互、任务详情管理和简单的密码保护。

## 需求总结

### 用户需求
- 团队规模：1-5人
- 任务状态管理：待办、进行中、审核、已完成
- 支持自定义添加/修改列
- 任务信息包含：标题、描述、负责人、优先级、截止日期、标签
- 必须支持拖拽功能
- 简单密码保护

### 技术需求
- 前端框架：React/Vue + 本地JSON文件存储
- 优先方案：React + Vite + JSON Server
- 拖拽库：@dnd-kit（现代化、性能优秀）
- 数据持久化：JSON文件存储，便于版本控制

## 系统架构

### 整体架构

```
前端 (React + Vite)
    ↓ HTTP请求
JSON Server (端口3001)
    ↓ 读写
db.json (数据文件)
```

### 技术栈
- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite
- **拖拽库**: @dnd-kit/core + @dnd-kit/sortable
- **HTTP客户端**: Axios
- **后端服务**: JSON Server（模拟REST API）
- **样式方案**: CSS Modules 或 Tailwind CSS
- **语言**: TypeScript

## 数据模型设计

### db.json 结构

```json
{
  "columns": [
    { "id": "col-1", "title": "待办", "order": 0 },
    { "id": "col-2", "title": "进行中", "order": 1 },
    { "id": "col-3", "title": "审核", "order": 2 },
    { "id": "col-4", "title": "已完成", "order": 3 }
  ],
  "tasks": [
    {
      "id": "task-1",
      "title": "任务标题",
      "description": "任务描述",
      "assignee": "张三",
      "priority": "high",
      "dueDate": "2026-04-15",
      "tags": ["前端", "紧急"],
      "columnId": "col-1",
      "order": 0,
      "createdAt": "2026-04-10T10:00:00Z",
      "updatedAt": "2026-04-10T10:00:00Z"
    }
  ],
  "settings": {
    "password": "hashed_password"
  }
}
```

### 数据类型定义

```typescript
interface Column {
  id: string;
  title: string;
  order: number;
}

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
  createdAt: string;
  updatedAt: string;
}

interface Settings {
  password: string;
}
```

### 优先级颜色标识
- **高优先级**: 红色 (#ef4444)
- **中优先级**: 黄色 (#f59e0b)
- **低优先级**: 绿色 (#10b981)

## 功能设计

### 1. 看板视图 (Board)
- 多列横向布局，支持滚动
- 列内任务垂直排列
- 拖拽卡片实现跨列移动
- 响应式设计，适配不同屏幕

### 2. 任务管理
- **创建任务**: 点击列顶部的"+"按钮，弹出模态框填写信息
- **编辑任务**: 点击任务卡片，进入编辑模式
- **删除任务**: 任务卡片上的删除按钮，带确认提示
- **拖拽排序**: 同列内拖拽调整顺序，跨列拖拽改变状态

### 3. 列管理
- **添加新列**: 看板右侧"+"按钮
- **编辑列名**: 双击列标题进行编辑
- **删除列**: 列菜单中的删除选项（需确认，任务移至前一列）

**删除列的逻辑规则**：
- 删除列时，该列内的所有任务移动到前一列
- 如果删除的是第一列，任务移动到第二列
- 如果只剩最后一列，禁止删除
- 删除确认对话框显示将受影响的任务数量

### 4. 密码保护
- 首次访问时设置密码
- 后续访问需输入密码验证
- 密码使用简单哈希存储在 db.json 的 settings 中
- 客户端验证，无需后端复杂认证

**安全说明**：
- 此密码保护为简单防护机制，适合小型团队内部使用
- 客户端哈希验证存在一定局限性（密码明文传输）
- 如需更高安全性，建议部署在内部网络或使用 HTTPS
- 未来可扩展为服务端验证（JSON Server 中间件）

## 组件结构

```
src/
├── components/
│   ├── Board/              # 看板主容器
│   ├── Column/             # 列组件
│   ├── TaskCard/           # 任务卡片
│   ├── TaskModal/          # 任务编辑弹窗
│   ├── ColumnModal/        # 列编辑弹窗
│   ├── PasswordModal/      # 密码输入弹窗
│   └── ConfirmDialog/      # 确认对话框
├── hooks/
│   ├── useTasks.ts         # 任务 CRUD 操作
│   ├── useColumns.ts       # 列管理操作
│   └── useDragDrop.ts      # 拖拽逻辑封装
├── services/
│   └── api.ts              # API 请求封装
├── types/
│   └── index.ts            # TypeScript 类型定义
└── App.tsx                 # 主应用
```

### 关键组件职责

#### Board 组件
- 管理整体布局和拖拽上下文
- 渲染所有列
- 处理列的添加/删除

#### Column 组件
- 渲染单列内容
- 处理列内拖放事件
- 管理列标题编辑

#### TaskCard 组件
- 显示任务信息（标题、负责人、优先级等）
- 响应拖拽和点击事件
- 显示悬停提示

#### useDragDrop Hook
- 封装 @dnd-kit 配置
- 处理拖拽开始、移动、结束事件
- 更新任务位置和排序

## 界面布局

```
┌─────────────────────────────────────────────────────────────┐
│  看板标题                              [添加列 +]           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ 待办  [+]│  │ 进行中   │  │ 审核     │  │ 已完成   │   │
│  ├──────────┤  ├──────────┤  ├──────────┤  ├──────────┤   │
│  │ ┌──────┐ │  │ ┌──────┐ │  │          │  │ ┌──────┐ │   │
│  │ │任务1 │ │  │ │任务3 │ │  │          │  │ │任务5 │ │   │
│  │ │张三  │ │  │ │李四  │ │  │          │  │ │王五  │ │   │
│  │ │🔴 高 │ │  │ │🟡 中 │ │  │          │  │ │🟢 低 │ │   │
│  │ └──────┘ │  │ └──────┘ │  │          │  │ └──────┘ │   │
│  │ ┌──────┐ │  │          │  │          │  │          │   │
│  │ │任务2 │ │  │          │  │          │  │          │   │
│  │ │李四  │ │  │          │  │          │  │          │   │
│  │ │🟡 中 │ │  │          │  │          │  │          │   │
│  │ └──────┘ │  │          │  │          │  │          │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 交互细节
- 卡片拖拽时有半透明阴影效果
- 拖拽悬停在列上时，列边框高亮
- 卡片悬停显示完整信息（tooltip）
- 优先级用色块标识，直观醒目
- 列宽固定（约300px），支持横向滚动
- 卡片高度自适应内容

## API 设计

### RESTful API 端点

JSON Server 自动生成以下端点：

```
列管理
GET    /columns          # 获取所有列
POST   /columns          # 创建新列
PUT    /columns/:id      # 更新列
DELETE /columns/:id      # 删除列

任务管理
GET    /tasks            # 获取所有任务
GET    /tasks/:id        # 获取单个任务
POST   /tasks            # 创建任务
PUT    /tasks/:id        # 更新任务
DELETE /tasks/:id        # 删除任务

设置管理
GET    /settings         # 获取设置（密码）
PUT    /settings         # 更新设置
```

### 关键 API 调用场景

#### 1. 拖拽任务
```http
PATCH /tasks/:id
Content-Type: application/json

{
  "columnId": "col-2",
  "order": 1,
  "updatedAt": "2026-04-10T12:00:00Z"
}
```

#### 2. 批量更新排序
拖拽后重算多个任务的 order 值，逐个更新：
```http
PUT /tasks/:id
Content-Type: application/json

{
  "order": 2,
  "updatedAt": "2026-04-10T12:00:00Z"
}
```

#### 3. 密码验证
客户端对比哈希值：
```typescript
// 客户端逻辑
const inputHash = simpleHash(inputPassword);
const storedHash = await api.getSettings();
return inputHash === storedHash.password;
```

## 错误处理

### 错误类型
1. **API 请求失败**: 显示错误提示，保留本地状态
2. **网络断开**: 提示用户检查网络，数据暂存本地
3. **拖拽失败**: 恢复原位置，显示错误提示
4. **表单验证**: 必填字段、日期格式校验
5. **并发冲突**: 使用乐观锁机制处理

### 并发控制机制
**乐观锁策略**：
- 使用 `updatedAt` 字段作为版本标识
- 更新任务时携带当前的 `updatedAt` 值
- 服务端对比版本，不一致则拒绝更新
- 客户端收到冲突提示，刷新数据后重新操作

**实现示例**：
```typescript
// 更新任务前检查版本
const updateTask = async (taskId: string, updates: Partial<Task>) => {
  const currentTask = await api.getTask(taskId);
  
  // 服务端验证版本
  if (updates.updatedAt !== currentTask.updatedAt) {
    throw new Error('数据已被其他用户修改，请刷新后重试');
  }
  
  // 更新成功后，设置新的时间戳
  return api.updateTask(taskId, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
};
```

### 错误提示策略
- 使用 Toast 通知显示错误信息
- 错误信息清晰明确，便于用户理解
- 提供重试或恢复选项

## 测试策略

### 单元测试
- 工具函数测试
- Hooks 逻辑测试
- 数据处理函数测试

### 组件测试
- 主要组件渲染测试
- 用户交互测试
- 拖拽功能测试

### E2E 测试
- 创建任务流程
- 拖拽任务流程
- 删除任务流程

## 部署方案

### 开发环境
```bash
# 终端1: 启动前端
npm run dev

# 终端2: 启动 JSON Server
npm run server
```

### 生产部署

#### 方案一：传统部署
- 前端：构建后部署到静态服务器（Nginx/Apache）
- 后端：JSON Server 部署到 Node 环境

#### 方案二：Docker 容器化
- 使用 Docker Compose 编排前端和后端服务
- 数据卷挂载 db.json 实现持久化

### 数据备份
- db.json 文件可提交到 Git 实现版本控制
- 建议定期备份 db.json 文件
- 可考虑实现自动备份脚本

## 扩展性考虑

### 未来可能的扩展功能
- 任务评论功能
- 文件附件上传
- 任务时间追踪
- 数据统计和报表
- 多看板支持
- 实时协作（WebSocket）

### 扩展设计原则
- 保持组件独立性，便于功能扩展
- API 设计遵循 RESTful 规范
- 数据结构预留扩展字段
- 模块化设计，支持按需加载

## 开发优先级

### 第一阶段：核心功能
1. 项目初始化和基础架构
2. 列的 CRUD 操作
3. 任务的 CRUD 操作
4. 拖拽功能实现
5. 密码保护功能

### 第二阶段：优化和完善
1. UI/UX 优化
2. 错误处理完善
3. 性能优化
4. 响应式设计

### 第三阶段：测试和部署
1. 单元测试
2. 组件测试
3. E2E 测试
4. 生产环境部署

## 总结

这是一个简洁实用的看板系统设计，满足小型团队的任务管理需求。通过 React + JSON Server 的技术栈，实现了快速开发和数据持久化。拖拽功能使用现代化的 @dnd-kit 库，提供流畅的用户体验。密码保护机制简单有效，适合小型团队使用。整体架构清晰，易于维护和扩展。
