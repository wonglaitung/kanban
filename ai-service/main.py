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
    try:
        result = call_backend_api("GET", "/api/columns")
        if not result["success"]:
            print(f"Warning: Backend API not available - {result['error']}")
    except Exception as e:
        print(f"Warning: Backend API check failed - {e}")
    yield


app = FastAPI(
    title="Kanban AI Service",
    description="AI 服务，提供任务数据字典和查询接口",
    version="0.1.0",
    lifespan=lifespan,
)


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

    result = call_backend_api("GET", "/api/tasks", params=params if params else None)
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

    if tags:
        tasks = [t for t in tasks if tags in t.get("tags", [])]
    if overdue is not None:
        tasks = [t for t in tasks if t["overdue"] == overdue]

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


@app.post("/api/ai/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """AI 对话接口"""
    api_key = (
        os.environ.get("API_KEY")
        or os.environ.get("OPENAI_API_KEY")
        or os.environ.get("ANTHROPIC_API_KEY")
    )
    base_url = os.environ.get("API_BASE_URL") or os.environ.get("OPENAI_BASE_URL")
    model = os.environ.get("AI_MODEL", "astron-code-latest")

    if not api_key:
        return ChatResponse(
            content="AI 服务未配置 API Key。请在 .env 文件中设置 API_KEY。",
            session_id=request.session_id or "default",
        )

    try:
        from harness import AgentHarness, HarnessConfig
        from harness.memory.memory_file import MemoryScoringConfig
        from harness.tools.builtins import UpdateCoreMemoryTool

        # 导入自定义工具
        from tools import (
            GenerateReportTool,
            GetTaskDictionaryTool,
            ManageTaskTool,
            QueryTasksTool,
        )

        memory_path = Path(__file__).parent.parent / "server" / "data"

        # 创建工具实例
        tools = [
            GetTaskDictionaryTool(),
            QueryTasksTool(),
            ManageTaskTool(),
            GenerateReportTool(api_key=api_key, base_url=base_url, model=model),
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

        # 运行对话
        result = await agent.run(
            request.message,
            session_id=request.session_id,
        )

        return ChatResponse(
            content=result.content,
            session_id=request.session_id or "default",
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

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("AI_SERVICE_PORT", 3002))
    uvicorn.run(app, host="0.0.0.0", port=port)
