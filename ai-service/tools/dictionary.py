"""
GetTaskDictionaryTool - 获取任务字段字典
"""

import json
from typing import Any

from harness.tools.base import Tool, ToolContext
from harness.types import ToolResult

from .helpers import call_backend_api


class GetTaskDictionaryTool(Tool):
    """获取任务字段字典工具"""

    # 从 config.dictionary 导入静态配置
    TASK_FIELDS = None
    QUERY_DIMENSIONS = None

    def __init__(self):
        # 延迟导入，避免循环依赖
        from config.dictionary import TASK_FIELDS, QUERY_DIMENSIONS

        self.TASK_FIELDS = TASK_FIELDS
        self.QUERY_DIMENSIONS = QUERY_DIMENSIONS

    @property
    def name(self) -> str:
        return "get_task_dictionary"

    @property
    def description(self) -> str:
        return "获取任务字段字典，了解可查询的字段和维度"

    @property
    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {},
            "required": [],
        }

    async def execute(
        self, arguments: dict[str, Any], context: ToolContext
    ) -> ToolResult:
        """返回任务字段描述（动态获取状态值）"""
        # 动态获取列配置
        status_values = []
        columns_result = call_backend_api("GET", "/api/columns")
        if columns_result["success"]:
            status_values = [col["title"] for col in columns_result["data"]]

        # 构建动态字段定义
        dynamic_fields = []
        for field in self.TASK_FIELDS:
            if field["name"] == "status":
                dynamic_field = dict(field)
                dynamic_field["values"] = status_values
                dynamic_fields.append(dynamic_field)
            else:
                dynamic_fields.append(field)

        result = {
            "fields": dynamic_fields,
            "dimensions": self.QUERY_DIMENSIONS,
        }

        return ToolResult(
            tool_call_id="",
            success=True,
            content=json.dumps(result, ensure_ascii=False),
        )
