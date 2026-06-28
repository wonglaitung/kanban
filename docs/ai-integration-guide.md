# AI 整合技术报告

> 本文档详细记录了看板系统 AI 助手的整合过程，为后续项目的 AI 整合提供技术参考和实施指南。

## 目录

1. [概述](#概述)
2. [架构设计](#架构设计)
3. [技术选型](#技术选型)
4. [实施步骤](#实施步骤)
5. [核心组件详解](#核心组件详解)
6. [前后端集成](#前后端集成)
7. [Docker 部署](#docker-部署)
8. [调试与问题排查](#调试与问题排查)
9. [最佳实践](#最佳实践)

---

## 概述

### 项目背景

看板系统是一个团队任务管理工具，AI 整合的目标是为用户提供智能助手功能，包括：

- 自然语言任务查询
- 智能任务创建与更新
- 自动生成工作报告
- 页面导航控制

### 整合效果

用户可以通过自然语言与系统交互：

```
用户: 有哪些高优先级任务？
AI: 查询并返回高优先级任务列表

用户: 把登录功能改为进行中
AI: 自动找到并更新对应任务状态

用户: 生成任务报告
AI: 生成 Word 格式的任务报告并提供下载链接
```

---

## 架构设计

### 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (React)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  看板界面    │  │  AI 聊天组件 │  │  其他组件...        │ │
│  └─────────────┘  └──────┬──────┘  └─────────────────────┘ │
└────────────────────────────┼────────────────────────────────┘
                             │ HTTP/WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      Nginx (反向代理)                        │
│  /api/*      → Backend :3001                                │
│  /api/ai/*   → AI Service :3002                             │
│  /downloads/* → 静态文件服务                                 │
└─────────────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
┌──────────────────────┐    ┌──────────────────────────────┐
│  Backend (Express)   │    │  AI Service (FastAPI)        │
│  - REST API          │    │  - Harness SDK Agent         │
│  - SQLite 数据库      │◄───│  - 自定义 Tools              │
│  - 业务逻辑           │    │  - Skill 定义                │
└──────────────────────┘    │  - Memory 管理               │
                            └──────────────────────────────┘
                                        │
                                        ▼
                            ┌──────────────────────────────┐
                            │  LLM API (OpenAI Compatible) │
                            └──────────────────────────────┘
```

### 服务端口分配

| 服务 | 端口 | 说明 |
|------|------|------|
| Frontend (dev) | 5173 | Vite 开发服务器 |
| Backend | 3001 | Express API 服务 |
| AI Service | 3002 | FastAPI + Harness SDK |
| Docker | 80/8080 | Nginx 统一入口 |

### 数据流

```
用户输入 → 前端 AIChat 组件
         → POST /api/ai/chat
         → AI Service (FastAPI)
         → Harness SDK Agent
         → LLM API
         → Tool 调用 (查询/管理任务)
         → Backend API
         → SQLite 数据库
         → 返回结果
         → 前端渲染 Markdown
```

---

## 技术选型

### AI 框架选择：Harness SDK

选择 Harness SDK 作为 AI Agent 框架，原因：

1. **工具系统完善**：内置 Tool 基类和 ToolResult 类型
2. **Skill 系统**：支持 Markdown 格式的技能定义
3. **Memory 管理**：自动管理会话记忆，支持容量限制和归档
4. **Provider 兼容**：支持 OpenAI 兼容的 API

### Python 技术栈

| 组件 | 技术 | 版本 | 用途 |
|------|------|------|------|
| Web 框架 | FastAPI | >= 0.100.0 | 异步 API 服务 |
| ASGI 服务器 | Uvicorn | >= 0.23.0 | 生产级服务器 |
| 数据验证 | Pydantic | >= 2.0.0 | 请求/响应模型 |
| 环境变量 | python-dotenv | >= 1.0.0 | .env 文件加载 |
| 文档生成 | python-docx | >= 0.8.11 | Word 报告生成 |
| Markdown 解析 | markdown | >= 3.4.0 | Markdown 转 HTML |
| HTML 解析 | beautifulsoup4 | >= 4.12.0 | HTML 处理 |

### 前端技术栈

| 组件 | 技术 | 用途 |
|------|------|------|
| Markdown 渲染 | react-markdown | AI 回复渲染 |
| GFM 支持 | remark-gfm | GitHub 风格 Markdown |

---

## 实施步骤

### 步骤 1：创建 AI 服务目录结构

```
ai-service/
├── main.py                 # FastAPI 入口
├── requirements.txt        # Python 依赖
├── config/
│   ├── __init__.py
│   └── dictionary.py       # 数据字典定义
├── tools/
│   ├── __init__.py         # 工具导出
│   ├── helpers.py          # 辅助函数
│   ├── dictionary.py       # 字典查询工具
│   ├── query_tasks.py      # 任务查询工具
│   ├── manage_task.py      # 任务管理工具
│   ├── generate_report.py  # 报告生成工具
│   └── navigate.py         # 页面导航工具
├── skills/
│   └── kanban.md           # Skill 定义
└── .harness/
    └── memory/
        └── sessions/       # 会话记忆存储
```

### 步骤 2：安装依赖

创建 `requirements.txt`：

```txt
fastapi>=0.100.0
uvicorn>=0.23.0
aiosqlite>=0.19.0
pydantic>=2.0.0
python-dotenv>=1.0.0
python-docx>=0.8.11
markdown>=3.4.0
beautifulsoup4>=4.12.0

# Harness SDK（本地安装）
# pip install -e /data/harness/packages/sdk
```

### 步骤 3：配置环境变量

在项目根目录 `.env` 文件中添加：

```bash
# AI 服务配置
API_KEY=your-api-key-here
API_BASE_URL=https://your-api-endpoint.com/v1
AI_MODEL=your-model-name

# 服务端口
AI_SERVICE_PORT=3002
```

### 步骤 4：实现核心服务

#### 4.1 主入口 (`main.py`)

```python
"""
Kanban AI 服务

提供任务数据字典和查询接口，供 AI 理解和查询任务数据。

API 设计:
1. GET /api/ai/dictionary - 返回任务字段描述
2. GET /api/ai/query - 查询任务数据
3. POST /api/ai/chat - AI 对话接口（使用 Harness SDK）
"""

import json
import os
import urllib.parse
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

# 加载环境变量
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")

# 添加 SDK 路径（本地开发）
SDK_PATH = Path(__file__).parent.parent.parent / "harness" / "packages" / "sdk" / "src"
import sys
if SDK_PATH.exists():
    sys.path.insert(0, str(SDK_PATH))

# 后端 API 地址
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:3001")

app = FastAPI(
    title="Kanban AI Service",
    description="AI 服务，提供任务数据字典和查询接口",
    version="0.1.0",
)


@app.post("/api/ai/chat")
async def chat(request: ChatRequest):
    """AI 对话接口"""
    api_key = os.environ.get("API_KEY")
    base_url = os.environ.get("API_BASE_URL")
    model = os.environ.get("AI_MODEL", "gpt-4")

    # 导入 Harness SDK
    from harness import AgentHarness, HarnessConfig
    from harness.memory.memory_file import MemoryScoringConfig
    from harness.tools.builtins import UpdateCoreMemoryTool

    # 导入自定义工具
    from tools import (
        QueryTasksTool,
        ManageTaskTool,
        GenerateReportTool,
        NavigateToPageTool,
    )

    # 创建工具实例
    tools = [
        QueryTasksTool(),
        ManageTaskTool(),
        GenerateReportTool(api_key=api_key, base_url=base_url, model=model),
        NavigateToPageTool(),
        UpdateCoreMemoryTool(),
    ]

    # 创建 Agent
    agent = AgentHarness(
        config=HarnessConfig(
            model=model,
            provider="openai",
            api_key=api_key,
            base_url=base_url,
            memory_md_path=ROOT_DIR / "server" / "data",
            memory_scoring=MemoryScoringConfig(
                enable_llm_evaluation=False,
                max_core_memory_tokens=3000,
                archive_fallback="file",
            ),
        ),
        tools=tools,
    )

    # 加载并激活 Skill
    skill_dir = Path(__file__).parent / "skills"
    agent.load_skills_from_dir(skill_dir)
    agent.activate_skill("kanban-assistant")

    # 运行对话
    result = await agent.run(
        request.message,
        session_id=request.session_id,
    )

    return ChatResponse(
        content=result.content,
        session_id=request.session_id or "default",
    )
```

#### 4.2 数据字典 (`config/dictionary.py`)

定义任务字段结构，让 AI 理解数据模型：

```python
TASK_FIELDS = [
    {
        "name": "id",
        "display_name": "任务ID",
        "type": "string",
        "description": "任务唯一标识符",
        "filterable": False,
    },
    {
        "name": "title",
        "display_name": "标题",
        "type": "string",
        "description": "任务标题",
        "filterable": False,
    },
    {
        "name": "status",
        "display_name": "状态",
        "type": "enum",
        "values": ["待办", "进行中", "审核", "已完成"],
        "description": "任务当前状态",
        "filterable": True,
    },
    {
        "name": "priority",
        "display_name": "优先级",
        "type": "enum",
        "values": ["high", "medium", "low"],
        "display_values": {"high": "高", "medium": "中", "low": "低"},
        "description": "任务优先级",
        "filterable": True,
    },
    # ... 更多字段
]
```

### 步骤 5：实现自定义工具

#### 5.1 工具基类

所有工具继承 `harness.tools.base.Tool`：

```python
from harness.tools.base import Tool, ToolContext
from harness.types import ToolResult

class QueryTasksTool(Tool):
    @property
    def name(self) -> str:
        return "query_tasks"

    @property
    def description(self) -> str:
        return "查询任务数据，支持按状态、优先级、负责人筛选"

    @property
    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "状态筛选"},
                "priority": {"type": "string", "description": "优先级筛选"},
                "assignee": {"type": "string", "description": "负责人筛选"},
                "overdue": {"type": "boolean", "description": "是否逾期"},
            },
            "required": [],
        }

    async def execute(
        self, arguments: dict[str, Any], context: ToolContext
    ) -> ToolResult:
        # 实现查询逻辑
        tasks = await self._query_backend(arguments)
        return ToolResult(
            tool_call_id="",
            success=True,
            content=json.dumps({"total": len(tasks), "tasks": tasks}),
        )
```

#### 5.2 后端 API 调用

工具通过 HTTP 调用后端 API：

```python
def call_backend_api(
    method: str, path: str, data: Optional[dict] = None, params: Optional[dict] = None
) -> dict:
    """调用后端 API"""
    import urllib.request

    url = f"{BACKEND_URL}{path}"

    # URL 编码（支持中文参数）
    if params:
        query_string = urllib.parse.urlencode(params, encoding='utf-8')
        url += f"?{query_string}"

    headers = {"Content-Type": "application/json"}

    if method == "GET":
        req = urllib.request.Request(url, headers=headers, method="GET")
    else:
        body = json.dumps(data).encode() if data else b""
        req = urllib.request.Request(url, data=body, headers=headers, method=method)

    with urllib.request.urlopen(req, timeout=10) as resp:
        return {"success": True, "data": json.loads(resp.read().decode())}
```

### 步骤 6：定义 Skill

创建 `skills/kanban.md`：

```markdown
---
name: kanban-assistant
description: 看板任务管理助手
version: 1.0.0
triggers:
  keywords:
    - 任务
    - 看板
    - 进度
    - 报告
tools:
  allowed:
    - get_task_dictionary
    - query_tasks
    - manage_task
    - generate_task_report
    - navigate_to_page
    - update_core_memory
---

你是一个看板任务管理助手，帮助用户查询、分析和管理任务数据。

## 可用工具

- **get_task_dictionary**: 获取字段描述
- **query_tasks**: 查询任务
- **manage_task**: 管理任务（创建/更新）
- **generate_task_report**: 生成 Word 报告
- **navigate_to_page**: 导航到指定页面

## 操作流程

1. 用户要求更新任务时，先调用 query_tasks 查询任务列表
2. 根据用户描述判断具体任务
3. 调用 manage_task 进行更新
```

### 步骤 7：前端集成

#### 7.1 AI API 服务 (`src/services/aiApi.ts`)

```typescript
const API_BASE = '/api/ai';

export interface ChatResponse {
  content: string;
  session_id: string;
  navigate?: {
    action: string;
    page: string;
    taskId?: string;
  };
}

export async function chat(message: string, sessionId?: string): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
  return response.json();
}
```

#### 7.2 AI 聊天组件 (`src/components/AIChat/AIChat.tsx`)

核心逻辑：

```tsx
export default function AIChat({ onClose, onNavigate }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId] = useState(`session-${Date.now()}`);

  const handleSend = async () => {
    const response = await chat(input, sessionId);

    // 处理导航指令
    if (response.navigate && onNavigate) {
      onNavigate(response.navigate.page, response.navigate);
    }

    // 添加 AI 回复
    setMessages(prev => [...prev, {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: response.content,
    }]);
  };

  return (
    <div className="ai-chat-container">
      {/* 消息列表 */}
      <div className="ai-chat-messages">
        {messages.map(msg => (
          <ReactMarkdown>{msg.content}</ReactMarkdown>
        ))}
      </div>

      {/* 输入区域 */}
      <textarea value={input} onChange={e => setInput(e.target.value)} />
      <button onClick={handleSend}>发送</button>
    </div>
  );
}
```

---

## 核心组件详解

### 1. Harness Agent 配置

```python
agent = AgentHarness(
    config=HarnessConfig(
        model="your-model",           # LLM 模型
        provider="openai",            # Provider 类型
        api_key="your-api-key",       # API 密钥
        base_url="https://...",       # API 端点
        memory_md_path=Path(...),     # Memory 存储路径
        memory_scoring=MemoryScoringConfig(
            enable_llm_evaluation=False,    # 禁用 LLM 评估
            max_core_memory_tokens=3000,    # 最大 token 数
            archive_fallback="file",        # 归档方式
        ),
    ),
    tools=[...],  # 工具列表
)
```

### 2. Tool 实现模式

```python
class MyTool(Tool):
    @property
    def name(self) -> str:
        return "my_tool"

    @property
    def description(self) -> str:
        return "工具描述，AI 会根据这个决定何时调用"

    @property
    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "param1": {"type": "string", "description": "参数说明"},
            },
            "required": ["param1"],
        }

    async def execute(
        self, arguments: dict[str, Any], context: ToolContext
    ) -> ToolResult:
        # 实现逻辑
        return ToolResult(
            tool_call_id="",
            success=True,
            content="返回给 AI 的结果",
        )
```

### 3. Memory 管理

Memory 文件存储在 `server/data/MEMORY.md`：

```markdown
# MEMORY.md

## User Profile
- 使用场景：看板系统管理团队任务
- 组织类型：银行

## Learned Patterns
- 回复风格：简洁，避免装饰性语言
- 查询规则：已完成的任务不需要查询
- 回复语言：使用中文回答所有问题
```

会话记忆存储在 `ai-service/.harness/memory/sessions/`。

### 4. 报告生成工具

`GenerateReportTool` 的实现流程：

1. 查询任务数据
2. 构建 prompt 调用 LLM 生成 Markdown 内容
3. 将 Markdown 转换为 HTML
4. 使用 python-docx 创建 Word 文档
5. 保存到 `server/data/downloads/`
6. 返回下载链接

---

## 前后端集成

### API 端点设计

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/ai/dictionary` | GET | 获取数据字典 |
| `/api/ai/query` | GET | 查询任务数据 |
| `/api/ai/chat` | POST | AI 对话 |
| `/downloads/{filename}` | GET | 下载报告文件 |

### Nginx 配置

```nginx
server {
    listen 80;
    root /app/dist;

    location /api {
        proxy_pass http://127.0.0.1:3001;
    }

    location /api/ai {
        proxy_pass http://127.0.0.1:3002;
    }

    location /downloads/ {
        alias /app/server/data/downloads/;
    }
}
```

---

## Docker 部署

### 多阶段 Dockerfile

```dockerfile
# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Build AI service
FROM python:3.10-alpine AS ai-builder
WORKDIR /app/ai-service
COPY ai-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY harness-sdk/ /tmp/harness-sdk/
RUN pip install --no-cache-dir /tmp/harness-sdk
COPY ai-service/ ./

# Stage 3: Production image
FROM node:20-alpine
# 复制各阶段产物
# 配置 Nginx
# 创建启动脚本
```

### 构建脚本

```bash
#!/bin/bash
# build-docker.sh

IMAGE_NAME="kanban-board"
HARNESS_SDK_PATH="/data/harness/packages/sdk"

# 创建临时构建目录
BUILD_DIR=$(mktemp -d)

# 复制项目文件
cp -r . "$BUILD_DIR/"

# 复制 Harness SDK
mkdir -p "$BUILD_DIR/harness-sdk"
cp -r "$HARNESS_SDK_PATH"/* "$BUILD_DIR/harness-sdk/"

# 构建镜像
docker build -t "$IMAGE_NAME" "$BUILD_DIR"

# 清理
rm -rf "$BUILD_DIR"
```

### 运行脚本

```bash
#!/bin/bash
# run-docker.sh

CONTAINER_NAME="kanban"
IMAGE_NAME="kanban-board"
DATA_DIR="$(pwd)/server/data"

docker run --name "$CONTAINER_NAME" \
    -p 80:80 \
    --env-file .env \
    -v "$DATA_DIR:/app/server/data" \
    "$IMAGE_NAME"
```

---

## 调试与问题排查

### 常见问题

#### 1. 中文编码问题

**问题**：URL 参数中的中文无法正确传递

**解决**：使用 `urllib.parse.urlencode(encoding='utf-8')`

```python
# 错误
url = f"{BACKEND_URL}/api/tasks?title={title}"

# 正确
query_string = urllib.parse.urlencode({"title": title}, encoding='utf-8')
url = f"{BACKEND_URL}/api/tasks?{query_string}"
```

#### 2. Harness SDK 路径问题

**问题**：本地开发时找不到 SDK

**解决**：动态添加 SDK 路径

```python
SDK_PATH = Path(__file__).parent.parent.parent / "harness" / "packages" / "sdk" / "src"
if SDK_PATH.exists():
    sys.path.insert(0, str(SDK_PATH))
```

#### 3. Docker 构建时 SDK 缺失

**问题**：Docker 构建找不到 Harness SDK

**解决**：在构建脚本中将 SDK 复制到构建上下文

```bash
mkdir -p "$BUILD_DIR/harness-sdk"
cp -r "$HARNESS_SDK_PATH"/* "$BUILD_DIR/harness-sdk/"
```

#### 4. Memory 归档问题

**问题**：Memory 超过限制导致错误

**解决**：配置 MemoryScoringConfig

```python
memory_scoring=MemoryScoringConfig(
    enable_llm_evaluation=False,
    max_core_memory_tokens=3000,
    archive_fallback="file",
)
```

### 日志调试

启动 AI 服务时会输出详细日志：

```bash
cd ai-service && python main.py

# 输出：
# INFO:     Started server process
# INFO:     Waiting for application startup.
# INFO:     Application startup complete.
# INFO:     Uvicorn running on http://0.0.0.0:3002
```

测试 API：

```bash
# 测试字典接口
curl http://localhost:3002/api/ai/dictionary

# 测试对话接口
curl -X POST http://localhost:3002/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "有哪些高优先级任务？"}'
```

---

## 最佳实践

### 1. Tool 设计原则

- **单一职责**：每个工具只做一件事
- **清晰的描述**：description 决定 AI 何时调用
- **明确的参数**：input_schema 要详细说明参数含义
- **友好的错误**：ToolResult.error 要包含有用的提示信息

### 2. Skill 设计原则

- **明确角色定位**：告诉 AI 它是什么
- **列出可用工具**：说明每个工具的用途
- **提供操作示例**：展示典型场景的处理流程
- **约束回复格式**：指定输出风格

### 3. 安全考虑

- **API 密钥管理**：使用环境变量，不要硬编码
- **输入验证**：在后端 API 验证所有参数
- **权限控制**：工具调用需遵循后端权限规则
- **敏感数据**：不要在 Memory 中存储敏感信息

### 4. 性能优化

- **异步调用**：使用 async/await 提高并发
- **结果缓存**：对频繁查询的数据进行缓存
- **请求限制**：设置合理的 timeout 和重试策略
- **日志级别**：生产环境减少日志输出

### 5. 可维护性

- **模块化设计**：工具独立，职责清晰
- **配置分离**：数据字典独立于代码
- **文档同步**：代码变更时更新文档
- **版本管理**：Skill 文件包含版本号

---

## 附录

### 项目文件清单

```
ai-service/
├── main.py                 # FastAPI 入口 (350 行)
├── requirements.txt        # 依赖列表
├── config/
│   └── dictionary.py       # 数据字典定义
├── tools/
│   ├── __init__.py         # 工具导出
│   ├── helpers.py          # 辅助函数 (105 行)
│   ├── dictionary.py       # 字典工具 (74 行)
│   ├── query_tasks.py      # 查询工具 (104 行)
│   ├── manage_task.py      # 管理工具 (327 行)
│   ├── generate_report.py  # 报告工具 (335 行)
│   └── navigate.py         # 导航工具 (89 行)
└── skills/
    └── kanban.md           # Skill 定义

src/
├── services/
│   └── aiApi.ts            # AI API 服务
└── components/AIChat/
    ├── AIChat.tsx          # 聊天组件
    └── AIChat.css          # 样式
```

### 参考资源

- [Harness SDK 文档](/data/harness/packages/sdk/README.md)
- [FastAPI 官方文档](https://fastapi.tiangolo.com/)
- [python-docx 文档](https://python-docx.readthedocs.io/)
- [OpenAI API 参考](https://platform.openai.com/docs/api-reference)

---

*文档版本：1.0.0 | 最后更新：2026-06-28*
