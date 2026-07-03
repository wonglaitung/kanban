"""
NavigateToPageTool - 导航到指定页面
"""

import json
from typing import Any

from harness.tools.base import Tool, ToolContext
from harness.types import ToolResult


class NavigateToPageTool(Tool):
    """导航到指定页面工具"""

    @property
    def name(self) -> str:
        return "navigate_to_page"

    @property
    def description(self) -> str:
        return (
            "【仅用于页面导航】当用户明确说'打开'、'去'、'跳转'、'查看详情'时使用。"
            "可用页面：settings（设置）、board（看板）、task（任务详情）。"
            "**不要用于**：更新任务、查询任务、创建任务——这些操作有专门的工具。"
            "示例：'打开任务A' → 使用本工具；'更新任务A进度' → 使用 manage_task，**不**使用本工具。"
        )

    @property
    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "page": {
                    "type": "string",
                    "enum": ["settings", "board", "task"],
                    "description": "目标页面：settings（设置）、board（看板）或 task（任务详情）",
                },
                "taskId": {
                    "type": "string",
                    "description": "任务 ID（仅当 page 为 task 时需要）",
                },
                "taskTitle": {
                    "type": "string",
                    "description": "任务标题关键词（仅当 page 为 task 时可选，用于模糊匹配）",
                },
            },
            "required": ["page"],
        }

    async def execute(
        self, arguments: dict[str, Any], context: ToolContext
    ) -> ToolResult:
        """执行导航操作"""
        page = arguments.get("page")
        task_id = arguments.get("taskId")
        task_title = arguments.get("taskTitle")

        if page not in ["settings", "board", "task"]:
            return ToolResult(
                tool_call_id="",
                success=False,
                content="",
                error=f"不支持的页面: {page}，必须是 settings、board 或 task",
            )

        result = {
            "action": "navigate",
            "page": page,
            "success": True,
            "message": f"已成功打开{page}页面",
            # 关键：在工具结果中明确告知后续操作不需要再导航
            "_hint": "导航完成。后续的更新、查询、创建操作请直接使用对应工具，不要再调用 navigate_to_page。",
        }

        if page == "task":
            if task_id:
                result["taskId"] = task_id
                result["message"] = f"已成功打开任务详情页面（taskId: {task_id}）"
            elif task_title:
                result["taskTitle"] = task_title
                result["message"] = f"已成功打开任务详情页面（关键词: {task_title}）"
            else:
                return ToolResult(
                    tool_call_id="",
                    success=False,
                    content="",
                    error="导航到任务详情页需要提供 taskId 或 taskTitle 参数",
                )

        return ToolResult(
            tool_call_id="",
            success=True,
            content=json.dumps(result, ensure_ascii=False),
        )
