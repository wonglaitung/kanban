"""
ManageTaskTool - 管理任务（创建/更新）
"""

import json
import re
from typing import Any, Optional

from harness.tools.base import Tool, ToolContext
from harness.types import ToolResult

from .helpers import call_backend_api, get_columns_mapping


class ManageTaskTool(Tool):
    """管理任务工具（创建/更新）"""

    @property
    def name(self) -> str:
        return "manage_task"

    @property
    def description(self) -> str:
        return (
            "管理任务。action='create'创建新任务，action='update'更新任务。"
            "title是任务标题关键词（不是ID），用于匹配任务。"
            "更新时：assignee改负责人，status改状态，priority改优先级。"
            "示例：action='update', title='登录', status='进行中'"
        )

    @property
    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["create", "update"],
                    "description": "操作类型",
                },
                "title": {
                    "type": "string",
                    "description": "任务标题。创建时是完整标题；更新时用于模糊匹配",
                },
                "new_title": {
                    "type": "string",
                    "description": "更新时的新标题（可选）",
                },
                "description": {
                    "type": "string",
                    "description": "任务描述",
                },
                "assignee": {
                    "type": "string",
                    "description": "负责人",
                },
                "priority": {
                    "type": "string",
                    "enum": ["high", "medium", "low"],
                    "description": "优先级",
                },
                "dueDate": {
                    "type": "string",
                    "description": "截止日期 (YYYY-MM-DD)",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "标签列表",
                },
                "status": {
                    "type": "string",
                    "description": "状态 (待办/进行中/审核/已完成)",
                },
                "progress": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 100,
                    "description": "进度 (0-100)",
                },
                "progressText": {
                    "type": "string",
                    "description": "进度说明",
                },
            },
            "required": ["action", "title"],
        }

    async def execute(
        self, arguments: dict[str, Any], context: ToolContext
    ) -> ToolResult:
        """执行任务管理操作"""
        action = arguments.get("action")
        title = arguments.get("title")
        new_title = arguments.get("new_title")
        description = arguments.get("description", "")
        assignee = arguments.get("assignee", "")
        priority = arguments.get("priority", "medium")
        due_date = arguments.get("dueDate", "")
        tags = arguments.get("tags")
        status = arguments.get("status", "")  # 空字符串表示不更新状态
        progress = arguments.get("progress")
        progress_text = arguments.get("progressText", "")

        if action == "create":
            return await self._create_task(
                title, description, assignee, priority, due_date, tags, status
            )
        elif action == "update":
            return await self._update_task(
                title,
                new_title,
                description,
                assignee,
                priority,
                due_date,
                tags,
                status,
                progress,
                progress_text,
            )
        else:
            return ToolResult(
                tool_call_id="",
                success=False,
                content="",
                error=f"不支持的操作: {action}，必须是 create/update",
            )

    async def _create_task(
        self,
        title: Optional[str],
        description: str,
        assignee: str,
        priority: str,
        due_date: str,
        tags: Optional[list],
        status: str,
    ) -> ToolResult:
        """创建任务"""
        if not title or not title.strip():
            return ToolResult(
                tool_call_id="",
                success=False,
                content="",
                error="创建任务需要提供 title",
            )

        if priority not in ["high", "medium", "low"]:
            return ToolResult(
                tool_call_id="",
                success=False,
                content="",
                error=f"不支持的优先级: {priority}，必须是 high/medium/low",
            )

        title_to_id, _ = get_columns_mapping()
        # 创建任务时，如果未指定状态，默认为"待办"
        if not status or status not in title_to_id:
            status = "待办"
            if "待办" not in title_to_id:
                # 回退到第一个可用的状态
                status = list(title_to_id.keys())[0]

        column_id = title_to_id[status]

        if tags is None:
            tags = []

        task_data = {
            "title": title.strip(),
            "description": description,
            "assignee": assignee,
            "priority": priority,
            "dueDate": due_date,
            "tags": tags,
            "columnId": column_id,
        }
        result = call_backend_api("POST", "/api/tasks", data=task_data)

        if not result["success"]:
            return ToolResult(
                tool_call_id="",
                success=False,
                content="",
                error=result["error"],
            )

        return ToolResult(
            tool_call_id="",
            success=True,
            content=json.dumps(
                {"success": True, "action": "create", "task": result["data"]},
                ensure_ascii=False,
            ),
        )

    async def _update_task(
        self,
        title: Optional[str],
        new_title: Optional[str],
        description: str,
        assignee: str,
        priority: str,
        due_date: str,
        tags: Optional[list],
        status: Optional[str],
        progress: Optional[int],
        progress_text: str,
    ) -> ToolResult:
        """更新任务"""
        if not title or not title.strip():
            return ToolResult(
                tool_call_id="",
                success=False,
                content="",
                error="更新任务需要提供 title 关键词",
            )

        search_title = title.strip()

        # 通过后端 API 搜索任务
        result = call_backend_api("GET", "/api/tasks/search", params={"title": search_title})

        if not result["success"]:
            return ToolResult(
                tool_call_id="",
                success=False,
                content="",
                error=result["error"],
            )

        rows = result["data"]

        # 如果找不到，尝试去掉常见前缀再搜索
        if len(rows) == 0:
            cleaned_title = re.sub(
                r"^(任务|task|Task)\s*", "", search_title, flags=re.IGNORECASE
            )
            if cleaned_title and cleaned_title != search_title:
                result = call_backend_api(
                    "GET", "/api/tasks/search", params={"title": cleaned_title}
                )
                if result["success"]:
                    rows = result["data"]

        if len(rows) == 0:
            return ToolResult(
                tool_call_id="",
                success=False,
                content="",
                error=f"未找到标题包含 '{search_title}' 的任务",
            )

        # 获取列映射
        columns_result = call_backend_api("GET", "/api/columns")
        columns_map = {}
        if columns_result["success"]:
            for col in columns_result["data"]:
                columns_map[col["id"]] = col["title"]

        if len(rows) > 1:
            tasks_info = []
            for r in rows:
                task_status = columns_map.get(r["columnId"], r["columnId"])
                tasks_info.append(f"- {r['title']} (状态: {task_status})")
            return ToolResult(
                tool_call_id="",
                success=False,
                content="",
                error=f"找到 {len(rows)} 个匹配的任务，请提供更精确的标题：\n"
                + "\n".join(tasks_info),
            )

        # 找到唯一匹配，通过后端 API 更新
        task_id = rows[0]["id"]

        # 构建更新数据
        update_data = {}
        if new_title and new_title.strip():
            update_data["title"] = new_title.strip()
        if description:
            update_data["description"] = description
        if assignee:
            update_data["assignee"] = assignee
        if priority and priority in ["high", "medium", "low"]:
            update_data["priority"] = priority
        if due_date:
            update_data["dueDate"] = due_date
        if tags is not None:
            update_data["tags"] = tags
        title_to_id, _ = get_columns_mapping()
        if status and status in title_to_id:
            update_data["columnId"] = title_to_id[status]
        if progress is not None and 0 <= progress <= 100:
            update_data["progress"] = progress
        if progress_text:
            update_data["progressText"] = progress_text

        if not update_data:
            return ToolResult(
                tool_call_id="",
                success=False,
                content="",
                error="没有提供要更新的字段",
            )

        # 调用后端 API 更新任务
        result = call_backend_api("PUT", f"/api/tasks/{task_id}", data=update_data)

        if not result["success"]:
            return ToolResult(
                tool_call_id="",
                success=False,
                content="",
                error=result["error"],
            )

        return ToolResult(
            tool_call_id="",
            success=True,
            content=json.dumps(
                {"success": True, "action": "update", "task": result["data"]},
                ensure_ascii=False,
            ),
        )
