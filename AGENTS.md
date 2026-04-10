# AGENTS.md - 项目上下文文件

## 项目概述

这是一个**看板系统(Kanban Board)**的设计与规划项目。项目目标是为小型团队(1-5人)提供一个简单实用的任务管理系统。

**项目状态**: 规划阶段 - 目前仅有设计文档，尚未开始代码实现

**核心特性**:
- 拖拽式任务管理
- 多列状态流转(待办、进行中、审核、已完成)
- 任务详情管理(标题、描述、负责人、优先级、截止日期、标签)
- 自定义列管理
- 简单密码保护

## 目录结构

```
/data/kanban/
├── AGENTS.md                              # 本文件 - 项目上下文说明
└── docs/
    └── superpowers/
        ├── plans/                         # 实施计划目录(待创建)
        └── specs/
            └── 2026-04-10-kanban-design.md # 详细设计文档
```

## 关键文件

### 设计文档

**`docs/superpowers/specs/2026-04-10-kanban-design.md`**

完整的看板系统设计文档，包含:
- 需求分析(用户需求 + 技术需求)
- 系统架构设计
- 数据模型定义(`Column`, `Task`, `Settings`)
- 功能设计(看板视图、任务管理、列管理、密码保护)
- 组件结构规划
- API 设计
- 错误处理与并发控制
- 测试策略
- 部署方案
- 扩展性考虑

## 技术栈规划

根据设计文档，该项目将使用以下技术栈:

| 类别 | 技术选型 |
|------|---------|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| 拖拽库 | @dnd-kit/core + @dnd-kit/sortable |
| HTTP客户端 | Axios |
| 后端服务 | JSON Server (模拟REST API) |
| 样式方案 | CSS Modules 或 Tailwind CSS |

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
  createdAt: string;
  updatedAt: string;
}
```

### Settings (设置)
```typescript
interface Settings {
  password: string; // 哈希存储
}
```

## 开发阶段

项目按以下阶段推进:

1. **第一阶段**: 核心功能 - 项目初始化、列/任务CRUD、拖拽功能、密码保护
2. **第二阶段**: 优化完善 - UI/UX优化、错误处理、性能优化、响应式设计
3. **第三阶段**: 测试部署 - 单元测试、组件测试、E2E测试、生产部署

## 使用说明

本目录用于:
- 存储看板系统的设计文档和规划
- 跟踪项目需求和决策
- 为开发提供技术参考

后续开发时，可参考 `docs/superpowers/specs/2026-04-10-kanban-design.md` 中的详细设计进行实现。

## 注意事项

- 数据存储使用 `db.json` 文件，便于版本控制
- 密码保护为客户端简单验证，适合小型团队内部使用
- 并发控制采用乐观锁策略(使用 `updatedAt` 字段)
- 优先级颜色标识: 高(红色) / 中(黄色) / 低(绿色)
