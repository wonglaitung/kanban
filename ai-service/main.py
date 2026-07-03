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
import time
import urllib.parse
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

# 加载根目录的 .env 文件
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")
load_dotenv(ROOT_DIR / ".env.local")
load_dotenv(ROOT_DIR / ".env.production")

# 添加 SDK 路径
SDK_PATH = Path(__file__).parent.parent.parent / "harness" / "packages" / "sdk" / "src"
import sys

if SDK_PATH.exists():
    sys.path.insert(0, str(SDK_PATH))

from config.dictionary import QUERY_DIMENSIONS, TASK_FIELDS

# 后端 API 地址
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:3001")


# ==================== 辅助函数 ====================


def call_backend_api(
    method: str, path: str, data: Optional[dict] = None, params: Optional[dict] = None
) -> dict:
    """调用后端 API"""
    import urllib.request

    url = f"{BACKEND_URL}{path}"

    if params:
        # 使用 urllib.parse.urlencode 正确编码查询参数（支持中文）
        filtered_params = {k: v for k, v in params.items() if v is not None}
        if filtered_params:
            query_string = urllib.parse.urlencode(filtered_params, encoding='utf-8')
            url += f"?{query_string}"

    headers = {"Content-Type": "application/json"}

    if method == "GET":
        req = urllib.request.Request(url, headers=headers, method="GET")
    else:
        body = json.dumps(data).encode() if data else b""
        req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
            return {"success": True, "data": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_columns_mapping() -> tuple[dict, dict]:
    """动态获取列映射"""
    result = call_backend_api("GET", "/api/columns")
    if not result["success"]:
        return {}, {}

    columns = result["data"]
    title_to_id = {col["title"]: col["id"] for col in columns}
    id_to_title = {col["id"]: col["title"] for col in columns}
    return title_to_id, id_to_title


def is_overdue(due_date: Optional[str], status: str) -> bool:
    """判断任务是否逾期"""
    if not due_date:
        return False
    if status == "已完成":
        return False
    try:
        if "T" in due_date:
            due = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
        else:
            due = datetime.strptime(due_date, "%Y-%m-%d")
            due = due.replace(hour=23, minute=59, second=59)
        return due < datetime.now()
    except (ValueError, TypeError):
        return False


# ==================== API 端点 ====================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 检查后端 API
    try:
        result = call_backend_api("GET", "/api/columns")
        if not result["success"]:
            print(f"Warning: Backend API not available - {result['error']}")
    except Exception as e:
        print(f"Warning: Backend API check failed - {e}")

    # 启动定时任务调度器
    await start_scheduler_on_startup()

    yield

    # 停止调度器（如果有）
    global _scheduler_manager
    if _scheduler_manager:
        await _scheduler_manager.stop()
        print("🛑 定时任务调度器已停止")


app = FastAPI(
    title="Kanban AI Service",
    description="AI 服务，提供任务数据字典和查询接口",
    version="0.1.0",
    lifespan=lifespan,
)

# 全局变量：缓存的 Agent 实例
_cached_agent = None
_cached_agent_timestamp = 0
AGENT_CACHE_TTL = 300  # Agent 缓存 5 分钟


async def get_or_create_agent():
    """
    获取或创建 AgentHarness 实例（带缓存）

    缓存 Agent 实例以避免每次请求都重新创建，
    这可以显著提高性能（创建 Agent 需要加载 skills、初始化工具等）。
    """
    global _cached_agent, _cached_agent_timestamp

    current_time = time.time()

    # 检查缓存是否有效
    if _cached_agent is not None and (current_time - _cached_agent_timestamp) < AGENT_CACHE_TTL:
        return _cached_agent

    # 创建新的 Agent 实例
    api_key = (
        os.environ.get("API_KEY")
        or os.environ.get("OPENAI_API_KEY")
        or os.environ.get("ANTHROPIC_API_KEY")
    )
    base_url = os.environ.get("API_BASE_URL") or os.environ.get("OPENAI_BASE_URL")
    model = os.environ.get("AI_MODEL", "astron-code-latest")

    if not api_key:
        return None

    try:
        from harness import AgentHarness, HarnessConfig
        from harness.memory.memory_file import MemoryScoringConfig
        from harness.tools.builtins import UpdateCoreMemoryTool

        from tools import (
            GenerateReportTool,
            GetTaskDictionaryTool,
            ManageTaskTool,
            NavigateToPageTool,
            QueryTasksTool,
            SendEmailTool,
        )

        memory_path = Path(__file__).parent.parent / "server" / "data"

        # 创建工具实例
        tools = [
            GetTaskDictionaryTool(),
            QueryTasksTool(),
            ManageTaskTool(),
            GenerateReportTool(api_key=api_key, base_url=base_url, model=model),
            NavigateToPageTool(),
            SendEmailTool(),
            UpdateCoreMemoryTool(),
        ]

        # 创建 Agent
        agent = AgentHarness(
            config=HarnessConfig(
                model=model,
                provider="openai",
                api_key=api_key,
                base_url=base_url,
                memory_md_path=memory_path,
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

        # 更新缓存
        _cached_agent = agent
        _cached_agent_timestamp = current_time

        return agent

    except Exception as e:
        print(f"创建 Agent 失败: {e}")
        return None


@app.get("/health")
async def health():
    """健康检查"""
    return {"status": "ok", "backend_url": BACKEND_URL}


@app.get("/api/ai/dictionary")
async def get_task_dictionary():
    """获取任务数据字典（动态获取状态值）"""
    status_values = []
    columns_result = call_backend_api("GET", "/api/columns")
    if columns_result["success"]:
        status_values = [col["title"] for col in columns_result["data"]]

    dynamic_fields = []
    for field in TASK_FIELDS:
        if field["name"] == "status":
            dynamic_field = dict(field)
            dynamic_field["values"] = status_values
            dynamic_fields.append(dynamic_field)
        else:
            dynamic_fields.append(field)

    dynamic_dimensions = []
    for dim in QUERY_DIMENSIONS:
        if dim["name"] == "status":
            dynamic_dim = dict(dim)
            dynamic_dim["values"] = status_values
            dynamic_dimensions.append(dynamic_dim)
        else:
            dynamic_dimensions.append(dim)

    return {
        "fields": dynamic_fields,
        "dimensions": dynamic_dimensions,
        "query_time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/ai/query")
async def query_tasks(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    assignee: Optional[str] = Query(None),
    overdue: Optional[bool] = Query(None),
    tags: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """查询任务数据"""
    params = {}
    title_to_id, _ = get_columns_mapping()
    if status:
        if status not in title_to_id:
            raise HTTPException(400, f"不支持的状态: {status}")
        params["status"] = title_to_id[status]
    if priority:
        if priority not in ["high", "medium", "low"]:
            raise HTTPException(400, f"不支持的优先级: {priority}")
        params["priority"] = priority
    if assignee:
        params["assignee"] = assignee

    # 逾期参数传递给后端处理
    if overdue is not None:
        params["overdue"] = "true" if overdue else "false"

    result = call_backend_api("GET", "/api/tasks/search", params=params if params else None)
    if not result["success"]:
        raise HTTPException(500, result["error"])

    tasks = result["data"]

    columns_map = {}
    columns_result = call_backend_api("GET", "/api/columns")
    if columns_result["success"]:
        for col in columns_result["data"]:
            columns_map[col["id"]] = col["title"]

    for task in tasks:
        task["status"] = columns_map.get(task["columnId"], task["columnId"])
        task["overdue"] = is_overdue(task.get("dueDate"), task["status"])

    # tags 过滤仍在前端处理（后端不支持）
    if tags:
        tasks = [t for t in tasks if tags in t.get("tags", [])]

    tasks = tasks[:limit]

    return {
        "total": len(tasks),
        "tasks": tasks,
        "query_time": datetime.now(timezone.utc).isoformat(),
    }


# ==================== 对话接口 ====================


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    content: str
    session_id: str
    navigate: Optional[dict] = None


# 操作意图关键词（不需要导航的操作）
_OPERATION_KEYWORDS = [
    "更新", "修改", "改", "设置", "设为",
    "查询", "查看", "显示", "列出", "有哪些", "找",
    "创建", "新增", "添加", "建立",
    "删除", "移除",
    "生成报告", "导出报告", "发送邮件",
]


def _detect_operation_intent(message: str) -> bool:
    """检测用户消息是否包含操作意图"""
    for keyword in _OPERATION_KEYWORDS:
        if keyword in message:
            return True
    return False


def _detect_navigate_intent(message: str) -> bool:
    """检测用户消息是否包含导航意图"""
    navigate_keywords = ["打开", "去", "跳转", "转到", "查看详情"]
    for keyword in navigate_keywords:
        if keyword in message:
            return True
    return False


@app.post("/api/ai/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """AI 对话接口"""
    # 记录请求的 session_id
    print(f"[AI Service] Chat request - session_id: {request.session_id}")

    # 获取缓存的 Agent 实例
    agent = await get_or_create_agent()

    if agent is None:
        return ChatResponse(
            content="AI 服务未配置 API Key。请在 .env 文件中设置 API_KEY。",
            session_id=request.session_id or "default",
        )

    try:
        # 检测用户意图，注入反导航提示
        user_message = request.message
        is_operation = _detect_operation_intent(user_message)
        is_navigate = _detect_navigate_intent(user_message)

        # 如果用户意图是操作但不是导航，注入提示
        if is_operation and not is_navigate:
            user_message = f"[系统指令：此请求直接执行操作，不要调用 navigate_to_page 工具]\n{request.message}"
            print(f"[AI Service] Injected anti-navigation hint for operation intent")

        # 运行对话
        result = await agent.run(
            user_message,
            session_id=request.session_id,
        )

        # 检查是否有导航工具调用
        navigate_action = None
        for msg in result.messages:
            content = msg.content
            # 检查消息内容是否包含导航指令
            if isinstance(content, str):
                try:
                    parsed = json.loads(content)
                    if isinstance(parsed, dict) and parsed.get("action") == "navigate":
                        navigate_action = parsed
                        break
                except (json.JSONDecodeError, TypeError):
                    pass
            elif isinstance(content, list):
                # 工具调用结果可能是列表格式
                for item in content:
                    if isinstance(item, dict):
                        try:
                            if item.get("action") == "navigate":
                                navigate_action = item
                                break
                        except (AttributeError, TypeError):
                            pass
                if navigate_action:
                    break

        # 如果用户意图是操作但不是导航，忽略导航结果
        if is_operation and not is_navigate and navigate_action:
            print(f"[AI Service] Blocked unnecessary navigation for operation intent - session_id: {request.session_id}")
            navigate_action = None

        # 记录导航操作
        if navigate_action:
            print(f"[AI Service] Navigate action detected - session_id: {request.session_id}, navigate: {navigate_action}")

        return ChatResponse(
            content=result.content,
            session_id=request.session_id or "default",
            navigate=navigate_action,
        )

    except ImportError as e:
        return ChatResponse(
            content=f"SDK 或依赖未安装: {str(e)}",
            session_id=request.session_id or "default",
        )
    except Exception as e:
        return ChatResponse(
            content=f"AI 服务错误: {str(e)}",
            session_id=request.session_id or "default",
        )


# ==================== 启动服务 ====================

# 全局变量：调度器管理器
_scheduler_manager = None


async def start_scheduler_on_startup():
    """启动定时任务调度器"""
    global _scheduler_manager

    # 获取缓存的 Agent 实例
    agent = await get_or_create_agent()

    if agent is None:
        print("⚠️ 未配置 API Key，定时任务调度器不会启动")
        return None

    try:
        from scheduler import setup_scheduler

        # 设置并启动调度器
        _scheduler_manager = setup_scheduler(agent)
        await _scheduler_manager.start()

        return _scheduler_manager

    except Exception as e:
        print(f"❌ 启动定时任务调度器失败: {e}")
        return None


@app.post("/api/ai/test-reminder")
async def test_reminder():
    """
    手动触发任务提醒测试（仅用于测试）

    用于测试定时任务逻辑，无需等待 Cron 触发。
    """
    # 获取缓存的 Agent 实例
    agent = await get_or_create_agent()

    if agent is None:
        return {"error": "AI 服务未配置 API Key"}

    try:
        # 执行任务分析
        result = await agent.run(
            "检查所有进行中的任务，分析进度和潜在风险，提供优先级建议，生成HTML格式的邮件并发送提醒",
            session_id="test-reminder",
        )

        return {
            "success": True,
            "content": result.content,
        }

    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("AI_SERVICE_PORT", 3002))
    uvicorn.run(app, host="0.0.0.0", port=port)
