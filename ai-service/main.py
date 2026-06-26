"""
Kanban AI 服务

提供任务数据字典和查询接口，供 AI 理解和查询任务数据。
参考: /data/bank-services-plugins/docs/backend_api_spec.md

API 设计:
1. GET /api/ai/dictionary - 返回任务字段描述
2. GET /api/ai/query - 查询任务数据
3. POST /api/ai/chat - AI 对话接口（使用 Harness SDK）
"""

import asyncio
import json
import os
import sqlite3
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

from config.dictionary import (
    ALLOWED_FILTERS,
    PRIORITY_DISPLAY,
    QUERY_DIMENSIONS,
    STATUS_MAPPING,
    STATUS_REVERSE_MAPPING,
    TASK_FIELDS,
)

# 数据库路径
DB_PATH = os.environ.get(
    "DB_PATH", str(Path(__file__).parent.parent / "server" / "data" / "kanban.db")
)


# ==================== 数据库操作 ====================


def get_db_connection():
    """获取数据库连接"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def parse_task(row: sqlite3.Row) -> dict:
    """解析任务行，处理 JSON 字段"""
    task = dict(row)
    if task.get("tags"):
        try:
            task["tags"] = json.loads(task["tags"])
        except json.JSONDecodeError:
            task["tags"] = []
    else:
        task["tags"] = []
    return task


def get_columns_mapping(conn: sqlite3.Connection) -> dict:
    """获取列 ID 到标题的映射"""
    rows = conn.execute("SELECT id, title FROM columns").fetchall()
    return {row["id"]: row["title"] for row in rows}


def is_overdue(due_date: Optional[str], status: str) -> bool:
    """判断任务是否逾期"""
    if not due_date:
        return False
    # 已完成的任务不算逾期
    if status == "已完成":
        return False
    try:
        # 处理不同日期格式
        if "T" in due_date:
            # ISO 格式: 2026-06-25T10:00:00
            due = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
        else:
            # 简单日期格式: 2026-06-25
            due = datetime.strptime(due_date, "%Y-%m-%d")
            # 设置为当天结束时间
            due = due.replace(hour=23, minute=59, second=59)

        # 获取当前时间（使用本地时间进行比较）
        now = datetime.now()
        return due < now
    except (ValueError, TypeError) as e:
        print(f"日期解析错误: {due_date}, {e}")
        return False


# ==================== API 端点 ====================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时检查数据库
    if not Path(DB_PATH).exists():
        print(f"Warning: Database not found at {DB_PATH}")
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
    return {"status": "ok", "db_path": DB_PATH}


@app.get("/api/ai/dictionary")
async def get_task_dictionary():
    """
    获取任务数据字典

    返回任务字段描述、可筛选维度，供 AI 理解数据结构。
    """
    return {
        "fields": TASK_FIELDS,
        "dimensions": QUERY_DIMENSIONS,
        "query_time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/ai/query")
async def query_tasks(
    status: Optional[str] = Query(None, description="状态筛选: 待办, 进行中, 审核, 已完成"),
    priority: Optional[str] = Query(None, description="优先级筛选: high, medium, low"),
    assignee: Optional[str] = Query(None, description="负责人筛选"),
    overdue: Optional[bool] = Query(None, description="是否逾期"),
    tags: Optional[str] = Query(None, description="标签筛选"),
    limit: int = Query(50, ge=1, le=200, description="返回数量限制"),
):
    """
    查询任务数据

    安全措施（参考 backend_api）：
    1. 参数白名单验证
    2. 直接读取 SQLite 数据库
    3. 不接受原始 SQL，防止注入
    """
    conn = get_db_connection()
    try:
        # 获取列映射
        columns_map = get_columns_mapping(conn)

        # 构建查询
        sql = "SELECT * FROM tasks WHERE 1=1"
        params: list[Any] = []

        # 状态筛选
        if status:
            if status not in STATUS_REVERSE_MAPPING:
                raise HTTPException(400, f"不支持的状态: {status}。支持的值: {list(STATUS_REVERSE_MAPPING.keys())}")
            column_id = STATUS_REVERSE_MAPPING[status]
            sql += ' AND columnId = ?'
            params.append(column_id)

        # 优先级筛选
        if priority:
            if priority not in ["high", "medium", "low"]:
                raise HTTPException(400, f"不支持的优先级: {priority}。支持的值: high, medium, low")
            sql += " AND priority = ?"
            params.append(priority)

        # 负责人筛选
        if assignee:
            sql += " AND assignee LIKE ?"
            params.append(f"%{assignee}%")

        # 标签筛选
        if tags:
            sql += " AND tags LIKE ?"
            params.append(f'%"{tags}"%')

        # 排序
        sql += ' ORDER BY "order"'

        # 执行查询
        rows = conn.execute(sql, params).fetchall()
        tasks = [parse_task(row) for row in rows]

        # 添加状态名称和逾期标记
        for task in tasks:
            task["status"] = columns_map.get(task["columnId"], task["columnId"])
            task["overdue"] = is_overdue(task.get("dueDate"), task["status"])

        # 逾期筛选（在 Python 中处理，因为需要计算）
        if overdue is not None:
            tasks = [t for t in tasks if t["overdue"] == overdue]

        # 限制返回数量
        tasks = tasks[:limit]

        return {
            "total": len(tasks),
            "tasks": tasks,
            "query_time": datetime.now(timezone.utc).isoformat(),
        }
    finally:
        conn.close()


# ==================== 对话接口 ====================


class ChatRequest(BaseModel):
    """对话请求"""

    message: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    """对话响应"""

    content: str
    session_id: str


@app.post("/api/ai/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    AI 对话接口

    使用 Harness SDK 进行多轮对话。
    AI 会自动调用 dictionary 和 query 接口获取任务数据。
    """
    # 读取配置（支持多种环境变量格式）
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

    # 尝试使用 Harness SDK
    try:
        from harness import AgentHarness
        from harness.tools.builtins import UpdateCoreMemoryTool

        # MEMORY.md 存放在 server/data/ 目录（与数据库同位置）
        memory_path = Path(__file__).parent.parent / "server" / "data"

        # 创建 Agent（支持第三方 OpenAI 兼容 API）
        agent = AgentHarness(
            model=model,
            provider="openai",
            api_key=api_key,
            base_url=base_url,
            memory_md_path=memory_path,
            tools=[
                UpdateCoreMemoryTool(),
            ],
            system_prompt="""你是一个看板任务管理助手，帮助用户查询和分析任务数据。

工具有：
- get_task_dictionary: 获取字段描述
- query_tasks: 查询任务（支持 status/priority/assignee/overdue 参数）

回答要求：
1. 先调用工具获取数据再回答
2. 使用简洁 Markdown，不用 --- 分隔线
3. 任务列表用表格或紧凑列表
4. 重点信息用 **加粗**""",
        )

        # 注册工具
        @agent.tool(description="获取任务字段字典，了解可查询的字段和维度")
        def get_task_dictionary_tool() -> dict:
            """返回任务字段描述"""
            return {
                "fields": TASK_FIELDS,
                "dimensions": QUERY_DIMENSIONS,
            }

        @agent.tool(description="查询任务数据，支持按状态、优先级、负责人、逾期状态筛选。查询逾期任务时，overdue参数必须为true。")
        def query_tasks_tool(
            status: Optional[str] = None,
            priority: Optional[str] = None,
            assignee: Optional[str] = None,
            overdue: Optional[bool] = None,
        ) -> dict:
            """查询任务数据。overdue=True表示查询逾期任务，overdue=False表示查询非逾期任务。"""
            # 同步方式调用数据库
            conn = get_db_connection()
            try:
                columns_map = get_columns_mapping(conn)
                sql = 'SELECT * FROM tasks WHERE 1=1'
                params: list[Any] = []

                if status:
                    if status not in STATUS_REVERSE_MAPPING:
                        return {"error": f"不支持的状态: {status}"}
                    sql += ' AND columnId = ?'
                    params.append(STATUS_REVERSE_MAPPING[status])

                if priority:
                    if priority not in ["high", "medium", "low"]:
                        return {"error": f"不支持的优先级: {priority}"}
                    sql += " AND priority = ?"
                    params.append(priority)

                if assignee:
                    sql += " AND assignee LIKE ?"
                    params.append(f"%{assignee}%")

                sql += ' ORDER BY "order" LIMIT 50'

                rows = conn.execute(sql, params).fetchall()
                tasks = [parse_task(row) for row in rows]

                for task in tasks:
                    task["status"] = columns_map.get(task["columnId"], task["columnId"])
                    task["overdue"] = is_overdue(task.get("dueDate"), task["status"])

                if overdue is not None:
                    # 处理字符串类型的 overdue 参数（AI 可能传递字符串 "true"）
                    if isinstance(overdue, str):
                        overdue = overdue.lower() == "true"
                    tasks = [t for t in tasks if t["overdue"] == overdue]

                return {"total": len(tasks), "tasks": tasks}
            finally:
                conn.close()

        # 运行对话
        result = await agent.run(
            request.message,
            session_id=request.session_id,
        )

        return ChatResponse(
            content=result.content,
            session_id=request.session_id or "default",
        )

    except ImportError:
        return ChatResponse(
            content="Harness SDK 未安装。请确保 SDK 路径正确。",
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
