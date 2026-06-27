"""
QueryTasksTool - 查询任务数据
"""

import json
from typing import Any, Optional

from harness.tools.base import Tool, ToolContext
from harness.types import ToolResult

from .helpers import call_backend_api, get_columns_mapping, is_overdue


class QueryTasksTool(Tool):
    """查询任务数据工具"""

    @property
    def name(self) -> str:
        return "query_tasks"

    @property
    def description(self) -> str:
        return "查询任务数据，支持按状态、优先级、负责人筛选。查询逾期任务时，overdue参数必须为true。"

    @property
    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "状态筛选",
                },
                "priority": {
                    "type": "string",
                    "description": "优先级筛选 (high/medium/low)",
                },
                "assignee": {
                    "type": "string",
                    "description": "负责人筛选",
                },
                "overdue": {
                    "type": "boolean",
                    "description": "是否逾期 (true=逾期, false=非逾期)",
                },
            },
            "required": [],
        }

    async def execute(
        self, arguments: dict[str, Any], context: ToolContext
    ) -> ToolResult:
        """查询任务数据"""
        status = arguments.get("status")
        priority = arguments.get("priority")
        assignee = arguments.get("assignee")
        overdue = arguments.get("overdue")

        # 构建查询参数
        params = {}
        title_to_id, _ = get_columns_mapping()
        if status and status in title_to_id:
            params["status"] = title_to_id[status]
        if priority:
            params["priority"] = priority
        if assignee:
            params["assignee"] = assignee

        # 调用后端 API 查询任务
        result = call_backend_api("GET", "/api/tasks", params=params if params else None)

        if not result["success"]:
            return ToolResult(
                tool_call_id="",
                success=False,
                content="",
                error=result["error"],
            )

        tasks = result["data"]

        # 添加状态名称映射
        columns_map = {}
        columns_result = call_backend_api("GET", "/api/columns")
        if columns_result["success"]:
            for col in columns_result["data"]:
                columns_map[col["id"]] = col["title"]

        for task in tasks:
            task["status"] = columns_map.get(task["columnId"], task["columnId"])
            task["overdue"] = is_overdue(task.get("dueDate"), task["status"])

        # 逾期筛选（在 Python 中处理）
        if overdue is not None:
            if isinstance(overdue, str):
                overdue = overdue.lower() == "true"
            tasks = [t for t in tasks if t["overdue"] == overdue]

        return ToolResult(
            tool_call_id="",
            success=True,
            content=json.dumps({"total": len(tasks), "tasks": tasks}, ensure_ascii=False),
        )
