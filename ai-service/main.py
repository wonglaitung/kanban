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
            system_prompt="""你是一个看板任务管理助手，帮助用户查询、分析和管理任务数据。

工具有：
- get_task_dictionary: 获取字段描述
- query_tasks: 查询任务（支持 status/priority/assignee/overdue 参数）
- create_task: 创建新任务（需提供 title，可选 description/assignee/priority/dueDate/tags/status）
- generate_task_report: 生成 Word 报告

回答要求：
1. 先调用工具获取数据再回答
2. 使用简洁 Markdown，不用 --- 分隔线
3. 任务列表用表格或紧凑列表
4. 重点信息用 **加粗**
5. 创建任务成功后，简要确认即可""",
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

        @agent.tool(description="创建新任务到看板。可以指定标题、描述、负责人、优先级、截止日期、标签和状态。")
        def create_task(
            title: str,
            description: str = "",
            assignee: str = "",
            priority: str = "medium",
            dueDate: str = "",
            tags: list[str] = None,
            status: str = "待办",
        ) -> dict:
            """
            创建新任务。

            Args:
                title: 任务标题（必填）
                description: 任务描述
                assignee: 负责人
                priority: 优先级 (high/medium/low)
                dueDate: 截止日期 (YYYY-MM-DD)
                tags: 标签列表
                status: 状态 (待办/进行中/审核/已完成)

            Returns:
                创建的任务信息
            """
            # 验证参数
            if not title or not title.strip():
                return {"error": "任务标题不能为空"}

            if priority not in ["high", "medium", "low"]:
                return {"error": f"不支持的优先级: {priority}，必须是 high/medium/low"}

            if status not in STATUS_REVERSE_MAPPING:
                return {"error": f"不支持的状态: {status}，必须是 待办/进行中/审核/已完成"}

            # 获取列 ID
            column_id = STATUS_REVERSE_MAPPING[status]

            # 生成任务 ID
            task_id = f"task-{int(datetime.now().timestamp() * 1000)}"

            # 处理标签
            if tags is None:
                tags = []

            # 获取当前时间
            now = datetime.now().isoformat()

            # 插入数据库
            conn = get_db_connection()
            try:
                conn.execute(
                    """INSERT INTO tasks
                       (id, title, description, assignee, priority, dueDate, tags, columnId, "order", progress, progressText, createdAt, updatedAt)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '', ?, ?)""",
                    (task_id, title.strip(), description, assignee, priority, dueDate, json.dumps(tags), column_id, now, now)
                )
                conn.commit()

                # 返回创建的任务
                return {
                    "success": True,
                    "task": {
                        "id": task_id,
                        "title": title.strip(),
                        "description": description,
                        "assignee": assignee,
                        "priority": priority,
                        "dueDate": dueDate,
                        "tags": tags,
                        "status": status,
                        "progress": 0,
                        "createdAt": now,
                    }
                }
            except Exception as e:
                return {"error": f"创建任务失败: {str(e)}"}
            finally:
                conn.close()

        @agent.tool(description="生成任务报告Word文档并返回下载链接。AI会根据content_hint参数生成符合需求的报告内容。返回结果包含 download_link 字段，请直接将此 Markdown 链接展示给用户。")
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
                content_hint: 内容提示，描述报告要包含什么内容（如"工作汇报，要有工作内容和进度"）
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
                import re

                # 1. 查询任务数据
                tasks = query_tasks_from_db(status, priority, assignee, limit=1000)

                # 获取评论
                for task in tasks:
                    task["comments"] = get_task_comments(task["id"])

                # 2. 让 AI 生成报告内容
                # 构建任务数据摘要
                tasks_summary = []
                priority_map = {"high": "高", "medium": "中", "low": "低"}
                for task in tasks:
                    task_info = {
                        "标题": task.get("title", ""),
                        "状态": task.get("status", ""),
                        "负责人": task.get("assignee", ""),
                        "优先级": priority_map.get(task.get("priority", ""), task.get("priority", "")),
                        "截止日期": task.get("dueDate", ""),
                        "进度": f"{task.get('progress', 0)}%",
                        "进度说明": task.get("progressText", ""),
                        "描述": task.get("description", ""),
                        "评论数": len(task.get("comments", [])),
                    }
                    tasks_summary.append(task_info)

                # 调用 LLM 生成报告内容
                report_prompt = f"""请根据以下任务数据生成一份报告，报告格式为 Markdown。

报告标题：{title}
用户需求：{content_hint or "标准任务报告"}

任务数据：
{json.dumps(tasks_summary, ensure_ascii=False, indent=2)}

要求：
1. 根据 "{content_hint}" 的需求组织报告内容
2. 使用 Markdown 格式
3. 标题用 ##，小标题用 ###
4. 重点内容用 **加粗**
5. 列表用 - 开头
6. 不要写"根据任务数据"之类的开场白，直接输出报告内容
7. 报告要有实质性内容，不要空洞"""

                # 使用 OpenAI API 生成报告
                import openai
                client = openai.OpenAI(
                    api_key=api_key,
                    base_url=base_url,
                )

                response = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": report_prompt}],
                    max_tokens=4000,
                )

                report_content = response.choices[0].message.content

                # 3. 创建 Word 文档
                doc = Document()

                # 标题
                heading = doc.add_heading(title, 0)
                heading.alignment = WD_ALIGN_PARAGRAPH.CENTER

                # 生成时间
                now = datetime.now()
                doc.add_paragraph(f"生成时间：{now.strftime('%Y-%m-%d %H:%M:%S')}")
                doc.add_paragraph()  # 空行

                # 4. 将 Markdown 内容写入 Word（使用 markdown + beautifulsoup4）
                import markdown
                from bs4 import BeautifulSoup, NavigableString

                # 转换 Markdown 到 HTML
                html_content = markdown.markdown(
                    report_content,
                    extensions=['fenced_code', 'tables']
                )
                soup = BeautifulSoup(html_content, 'html.parser')

                def process_element(element, doc):
                    """递归处理 HTML 元素并写入 Word"""
                    if isinstance(element, NavigableString):
                        text = str(element).strip()
                        if text:
                            return text
                        return None

                    tag = element.name

                    if tag in ['h1']:
                        text = element.get_text()
                        if text:
                            doc.add_heading(text, level=1)
                    elif tag in ['h2']:
                        text = element.get_text()
                        if text:
                            doc.add_heading(text, level=2)
                    elif tag in ['h3', 'h4']:
                        text = element.get_text()
                        if text:
                            doc.add_heading(text, level=3)
                    elif tag == 'p':
                        p = doc.add_paragraph()
                        process_inline(element, p)
                    elif tag in ['ul', 'ol']:
                        for li in element.find_all('li', recursive=False):
                            text = li.get_text()
                            doc.add_paragraph(text, style='List Bullet')
                    elif tag == 'table':
                        # 表格处理
                        rows = element.find_all('tr')
                        if rows:
                            # 获取最大列数
                            max_cols = max(len(row.find_all(['th', 'td'])) for row in rows)
                            table = doc.add_table(rows=len(rows), cols=max_cols)
                            table.style = 'Table Grid'

                            for i, row in enumerate(rows):
                                cells = row.find_all(['th', 'td'])
                                for j, cell in enumerate(cells):
                                    if j < max_cols:
                                        cell_para = table.rows[i].cells[j].paragraphs[0]
                                        # 清空默认段落
                                        cell_para.clear()
                                        # 处理单元格内的格式
                                        process_inline(cell, cell_para)
                                        # 表头加粗
                                        if cell.name == 'th':
                                            for run in cell_para.runs:
                                                run.bold = True
                    elif tag == 'blockquote':
                        text = element.get_text()
                        if text:
                            doc.add_paragraph(text, style='Quote')
                    else:
                        # 其他标签，直接处理子元素
                        for child in element.children:
                            process_element(child, doc)

                def process_inline(element, paragraph):
                    """处理行内元素（加粗、斜体等）"""
                    for child in element.children:
                        if isinstance(child, NavigableString):
                            text = str(child)
                            if text.strip():
                                paragraph.add_run(text)
                        elif child.name == 'strong' or child.name == 'b':
                            paragraph.add_run(child.get_text()).bold = True
                        elif child.name == 'em' or child.name == 'i':
                            paragraph.add_run(child.get_text()).italic = True
                        elif child.name == 'code':
                            run = paragraph.add_run(child.get_text())
                            run.font.name = 'Courier New'
                        elif child.name == 'br':
                            paragraph.add_run('\n')
                        elif child.name == 'span':
                            # 忽略 span 标签，只取文本
                            process_inline(child, paragraph)
                        else:
                            # 其他标签，递归处理
                            process_inline(child, paragraph)

                # 处理所有顶层元素
                for element in soup.children:
                    if isinstance(element, NavigableString):
                        text = str(element).strip()
                        if text:
                            doc.add_paragraph(text)
                    else:
                        process_element(element, doc)

                # 5. 保存文件
                filename = f"task_report_{now.strftime('%Y%m%d_%H%M%S')}.docx"
                filepath = DOWNLOADS_DIR / filename
                doc.save(str(filepath))

                # 6. 清理旧文件（保留最近10个）
                report_files = sorted(
                    DOWNLOADS_DIR.glob("task_report_*.docx"),
                    key=lambda f: f.stat().st_mtime,
                    reverse=True
                )
                for old_file in report_files[10:]:
                    old_file.unlink()

                # 7. 返回下载链接
                download_url = f"/downloads/{filename}"
                return {
                    "success": True,
                    "filename": filename,
                    "download_url": download_url,
                    "download_link": f"[点击下载：{filename}]({download_url})",
                    "total_tasks": len(tasks),
                }

            except ImportError as e:
                return {"error": f"依赖未安装: {str(e)}"}
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
