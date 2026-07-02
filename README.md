# 智能看板系统 (Kanban Board)

一个简洁实用的智能看板系统，用于小型团队（1-5人）管理组内任务。核心特色是**数字分身**——一个理解自然语言的 AI 助手，让用户通过对话完成所有任务管理操作。

---

## 数字分身

数字分身是本系统的核心特色，它不仅是一个聊天机器人，而是一个真正理解你意图并执行操作的智能助手。

### 核心能力

| 能力 | 说明 | 示例 |
|------|------|------|
| **自然语言查询** | 用日常语言查询任务，无需记忆复杂命令 | "有哪些高优先级任务？"、"张三负责哪些任务？" |
| **智能任务管理** | 创建和更新任务，自动填充默认值 | "新增任务：完成用户登录功能"、"把登录任务改为进行中" |
| **报告生成** | 一键生成专业 Word 报告 | "生成进行中任务的报告" |
| **页面导航** | 通过对话打开页面，无缝跳转 | "打开设置页面"、"查看用户登录这个任务" |
| **邮件提醒** | 发送任务状态邮件 | "发送邮件提醒给团队" |
| **定时提醒** | 每天 17:00 自动分析任务并发送邮件 | 无需手动操作 |

### 技术架构

数字分身基于 **Harness SDK** 构建，采用 Agent + Skill + Tool 三层架构：

```
用户输入
    ↓
┌─────────────────────────────────────────┐
│            AgentHarness                  │
│  (LLM + 记忆管理 + 会话隔离)              │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│              Skill 层                    │
│  (kanban.md - 定义行为规范和能力边界)     │
│  • 角色定义：告诉 AI 它是什么、能做什么    │
│  • 工具优先级：解决模糊请求的选择问题      │
│  • 工具生命周期：防止重复调用工具          │
│  • 错误处理：优雅处理异常情况              │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│              Tool 层                     │
│  • query_tasks - 任务查询                │
│  • manage_task - 任务创建/更新           │
│  • generate_task_report - 报告生成       │
│  • navigate_to_page - 页面导航           │
│  • send_email - 邮件发送                 │
└─────────────────────────────────────────┘
    ↓
后端 API / 前端导航
```

### 对话示例

```
用户: 有哪些高优先级任务？
分身: 找到 3 个高优先级任务：
      | 任务 | 状态 | 负责人 |
      |------|------|--------|
      | 用户登录 | 进行中 | 张三 |
      | 数据导出 | 待办 | 李四 |
      | 性能优化 | 待办 | 王五 |

用户: 打开用户登录这个任务
分身: [自动打开任务详情页] 已打开"用户登录"的详情页。

用户: 把进度改成 80%
分身: 已将"用户登录"的进度更新为 80%。

用户: 这个任务的负责人是谁？
分身: "用户登录"的负责人是张三。（注意：不会重复打开页面）
```

### Skill 设计最佳实践

数字分身的行为由 `ai-service/skills/kanban.md` 定义，遵循以下最佳实践：

1. **明确的角色定义** - 定义能力边界，避免执行不支持的操作
2. **工具选择优先级** - 当多个工具适用时，明确选择顺序
3. **工具生命周期管理** - 定义触发条件和结束条件，防止"工具强迫症"
4. **完整的对话示例** - 提供正反示例，指导正确行为
5. **错误处理指导** - 告诉 AI 如何处理异常情况

详细文档见 [AI 整合技术报告](docs/ai-integration-guide.md)

### 定时任务提醒

数字分身支持每天 17:00 自动执行任务分析并发送邮件提醒：

- 自动查询进行中的任务
- 分析进度和潜在风险
- 提供优先级建议
- 发送 HTML 格式邮件

配置方法见下方"邮件服务配置"章节。

---

## 其他功能特性

- **拖拽式任务管理** - 流畅的拖拽体验，支持跨列移动和列内排序
- **多列状态流转** - 待办、进行中、审核、已完成
- **任务详情管理** - 标题、描述、负责人、优先级、截止日期、标签、进度
- **任务评论讨论** - 支持主管追问和负责人回复
- **自定义列管理** - 添加、编辑、删除列
- **令牌保护** - 简单的访问控制
- **记忆容量管理** - 自动归档低重要性记忆
- **搜索功能** - 快速搜索任务、负责人、标签
- **专业银行主题** - 深蓝金、科技蓝、森林绿三种主题，IBM Plex 字体

---

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

---

## 快速开始

### 本地开发

1. **安装依赖**
   ```bash
   # 前端依赖
   npm install
   
   # 后端依赖
   cd server && npm install && cd ..
   
   # AI 服务依赖
   cd ai-service && pip install -r requirements.txt && cd ..
   
   # Harness SDK
   pip install -e /data/harness/packages/sdk
   ```

2. **配置 AI 服务**
   
   创建 `.env` 文件：
   ```bash
   cp .env.example .env
   ```
   
   编辑 `.env`：
   ```
   API_KEY=your-api-key
   API_BASE_URL=https://your-api-endpoint/v2
   AI_MODEL=your-model-name
   ```

3. **启动服务**
   
   终端1（前端）：`npm run dev`
   
   终端2（后端）：`cd server && npm start`
   
   终端3（AI 服务）：`cd ai-service && python main.py`

4. **访问应用**
   
   打开 `http://localhost:5173`，点击右下角 AI 图标与数字分身对话

### Docker 部署

```bash
# 配置环境变量
cp .env.example .env

# 构建并运行
./build-docker.sh
./run-docker.sh
```

---

## 邮件服务配置

在 `.env` 文件中配置 SMTP：

```bash
# SMTP 配置
SMTP_SERVER=smtp.163.com
SMTP_PORT=465
SMTP_USER=your-email@163.com
SMTP_PASSWORD=your-auth-code
RECIPIENTS=user1@example.com,user2@example.com

# 定时任务
TEST_MODE=false  # true=每1分钟触发（测试），false=每天17:00（生产）
```

**不同邮箱配置**：
- **163邮箱**：端口 465，SSL，需要授权码
- **Gmail**：端口 587，TLS，需要应用专用密码

---

## 项目结构

```
/data/kanban/
├── src/                    # 前端源码
│   └── components/
│       └── AIChat/        # 数字分身聊天组件
├── server/                 # 后端源码
│   ├── server.js
│   └── db.js
├── ai-service/             # AI 服务
│   ├── main.py            # FastAPI 入口
│   ├── scheduler.py       # 定时任务调度
│   ├── skills/
│   │   └── kanban.md      # 数字分身 Skill 定义
│   └── tools/             # 自定义工具
│       ├── query_tasks.py
│       ├── manage_task.py
│       ├── generate_report.py
│       ├── navigate.py
│       └── send_email.py
└── docs/
    └── ai-integration-guide.md  # AI 整合技术报告
```

---

## API 端点

### AI 智能助手
- `POST /api/ai/chat` - 多轮对话，自然语言查询和分析任务

### 任务管理
- `GET /api/tasks` - 获取所有任务
- `POST /api/tasks` - 创建任务
- `PUT /api/tasks/:id` - 更新任务
- `DELETE /api/tasks/:id` - 删除任务

### 列管理
- `GET /api/columns` - 获取所有列
- `POST /api/columns` - 创建新列
- `PUT /api/columns/:id` - 更新列
- `DELETE /api/columns/:id` - 删除列

### 评论管理
- `GET /api/tasks/:id/comments` - 获取任务评论
- `POST /api/tasks/:id/comments` - 添加评论

---

## 安全说明

- 令牌保护为简单防护机制，适合小型团队内部使用
- 建议部署在内部网络或使用 HTTPS
- 默认令牌为 `123456`，生产环境请修改

---

## 许可证

MIT License
