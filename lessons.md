# 开发经验与学习笔记

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

更新时间: 2026-04-10
更新人: iFlow CLI
