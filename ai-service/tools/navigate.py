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
            "导航到指定页面。可用页面：settings（设置页面）、board（看板主页）、task（任务详情）。"
            "当用户想打开设置、修改令牌、切换主题时使用 settings。"
            "当用户想返回看板主页时使用 board。"
            "当用户想查看某个任务详情时使用 task，需要提供 taskId 参数。"
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
        }

        if page == "task":
            if task_id:
                result["taskId"] = task_id
            elif task_title:
                result["taskTitle"] = task_title
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
