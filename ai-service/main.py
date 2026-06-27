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

# 下载目录（用于存放生成的报告文件）
DOWNLOADS_DIR = Path(__file__).parent.parent / "server" / "data" / "downloads"
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)


# ==================== 任务查询 ====================


def query_tasks_from_db(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assignee: Optional[str] = None,
    overdue: Optional[bool] = None,
    limit: int = 50,
) -> list[dict]:
    """
    从数据库查询任务数据（公共函数）

    Args:
        status: 状态筛选
        priority: 优先级筛选
        assignee: 负责人筛选
        overdue: 逾期状态筛选
        limit: 返回数量限制

    Returns:
        任务列表
    """
    conn = get_db_connection()
    try:
        columns_map = get_columns_mapping(conn)
        sql = 'SELECT * FROM tasks WHERE 1=1'
        params: list[Any] = []

        if status:
            if status not in STATUS_REVERSE_MAPPING:
                return []
            sql += ' AND columnId = ?'
            params.append(STATUS_REVERSE_MAPPING[status])

        if priority:
            if priority not in ["high", "medium", "low"]:
                return []
            sql += " AND priority = ?"
            params.append(priority)

        if assignee:
            sql += " AND assignee LIKE ?"
            params.append(f"%{assignee}%")

        sql += f' ORDER BY "order" LIMIT {limit}'

        rows = conn.execute(sql, params).fetchall()
        tasks = [parse_task(row) for row in rows]

        for task in tasks:
            task["status"] = columns_map.get(task["columnId"], task["columnId"])
            task["overdue"] = is_overdue(task.get("dueDate"), task["status"])

        if overdue is not None:
            if isinstance(overdue, str):
                overdue = overdue.lower() == "true"
            tasks = [t for t in tasks if t["overdue"] == overdue]

        return tasks
    finally:
        conn.close()


def get_task_comments(task_id: str) -> list[dict]:
    """获取任务的所有评论"""
    conn = get_db_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM comments WHERE taskId = ? ORDER BY createdAt",
            (task_id,)
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


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
        from harness import AgentHarness, HarnessConfig
        from harness.memory.memory_file import MemoryScoringConfig
        from harness.tools.builtins import UpdateCoreMemoryTool

        # MEMORY.md 存放在 server/data/ 目录（与数据库同位置）
        memory_path = Path(__file__).parent.parent / "server" / "data"

        # 创建 Agent（支持第三方 OpenAI 兼容 API）
        agent = AgentHarness(
            config=HarnessConfig(
                model=model,
                provider="openai",
                api_key=api_key,
                base_url=base_url,
                memory_md_path=memory_path,
                memory_scoring=MemoryScoringConfig(
                    enable_llm_evaluation=False, # LLM 评估需要 Anthropic API，暂不启用
                    max_core_memory_tokens=3000,  # 容量限制（约 50 条记忆）
                    archive_fallback="file",      # 超限时归档到 MEMORY_ARCHIVE.md
                ),
            ),
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
            tasks = query_tasks_from_db(status, priority, assignee, overdue)
            return {"total": len(tasks), "tasks": tasks}

        @agent.tool(description="生成任务报告Word文档并返回下载链接。可根据用户需求灵活组织报告内容。")
        def generate_task_report(
            title: str = "任务报告",
            content_hint: str = "",
            status: Optional[str] = None,
            priority: Optional[str] = None,
            assignee: Optional[str] = None,
        ) -> dict:
            """
            生成任务报告Word文档。

            Args:
                title: 报告标题
                content_hint: 内容提示，描述报告要包含什么内容
                status: 筛选状态
                priority: 筛选优先级
                assignee: 筛选负责人

            Returns:
                包含下载链接的字典
            """
            try:
                from docx import Document
                from docx.shared import Pt, Inches
                from docx.enum.text import WD_ALIGN_PARAGRAPH

                # 1. 查询任务数据
                tasks = query_tasks_from_db(status, priority, assignee, limit=1000)

                # 获取评论
                task_comments: dict[str, list] = {}
                for task in tasks:
                    task_comments[task["id"]] = get_task_comments(task["id"])

                # 2. 创建 Word 文档
                doc = Document()

                # 标题
                heading = doc.add_heading(title, 0)
                heading.alignment = WD_ALIGN_PARAGRAPH.CENTER

                # 生成时间
                now = datetime.now()
                doc.add_paragraph(f"生成时间：{now.strftime('%Y-%m-%d %H:%M:%S')}")

                # 统计摘要
                doc.add_heading("摘要", level=1)
                total = len(tasks)
                status_count: dict[str, int] = {}
                overdue_count = 0
                for t in tasks:
                    s = t["status"]
                    status_count[s] = status_count.get(s, 0) + 1
                    if t["overdue"]:
                        overdue_count += 1

                summary = doc.add_paragraph()
                summary.add_run(f"总任务数：{total}\n")
                for s, c in status_count.items():
                    summary.add_run(f"  {s}：{c} 个\n")
                if overdue_count > 0:
                    summary.add_run(f"逾期任务：{overdue_count} 个")

                # 任务列表
                if tasks:
                    doc.add_heading("任务列表", level=1)

                    # 创建表格
                    table = doc.add_table(rows=1, cols=6)
                    table.style = 'Table Grid'

                    # 表头
                    header_cells = table.rows[0].cells
                    headers = ["标题", "状态", "负责人", "优先级", "截止日期", "进度"]
                    for i, h in enumerate(headers):
                        header_cells[i].text = h

                    # 任务数据
                    priority_map = {"high": "高", "medium": "中", "low": "低"}
                    for task in tasks:
                        row_cells = table.add_row().cells
                        row_cells[0].text = task.get("title", "")
                        row_cells[1].text = task.get("status", "")
                        row_cells[2].text = task.get("assignee", "")
                        row_cells[3].text = priority_map.get(task.get("priority", ""), task.get("priority", ""))
                        row_cells[4].text = task.get("dueDate", "") or "无"
                        row_cells[5].text = f"{task.get('progress', 0)}%"

                        # 添加评论（如果有）
                        comments = task_comments.get(task["id"], [])
                        if comments:
                            row_cells[0].text += f" ({len(comments)}条评论)"

                    # 评论详情
                    has_comments = any(task_comments.values())
                    if has_comments:
                        doc.add_heading("评论详情", level=1)
                        for task in tasks:
                            comments = task_comments.get(task["id"], [])
                            if comments:
                                doc.add_heading(f"任务：{task['title']}", level=2)
                                for c in comments:
                                    p = doc.add_paragraph()
                                    p.add_run(f"{c['author']}").bold = True
                                    p.add_run(f" ({c['createdAt']}): {c['content']}")

                # 3. 保存文件
                filename = f"task_report_{now.strftime('%Y%m%d_%H%M%S')}.docx"
                filepath = DOWNLOADS_DIR / filename
                doc.save(str(filepath))

                # 4. 清理旧文件（保留最近10个）
                report_files = sorted(
                    DOWNLOADS_DIR.glob("task_report_*.docx"),
                    key=lambda f: f.stat().st_mtime,
                    reverse=True
                )
                for old_file in report_files[10:]:
                    old_file.unlink()

                # 5. 返回下载链接
                return {
                    "success": True,
                    "filename": filename,
                    "download_url": f"/downloads/{filename}",
                    "total_tasks": total,
                }

            except ImportError:
                return {"error": "python-docx 未安装，无法生成 Word 文档"}
            except Exception as e:
                return {"error": f"生成报告失败: {str(e)}"}

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
