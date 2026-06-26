"""
任务数据字典定义

定义任务字段、可筛选维度，供 AI 理解数据结构。
参考: /data/bank-services-plugins/docs/backend_api_spec.md
"""

# 任务字段定义
TASK_FIELDS = [
    {
        "name": "id",
        "display_name": "任务ID",
        "type": "string",
        "description": "任务唯一标识符",
        "filterable": False,
    },
    {
        "name": "title",
        "display_name": "标题",
        "type": "string",
        "description": "任务标题，简要描述任务内容",
        "filterable": False,
    },
    {
        "name": "description",
        "display_name": "描述",
        "type": "string",
        "description": "任务详细描述",
        "filterable": False,
    },
    {
        "name": "status",
        "display_name": "状态",
        "type": "enum",
        "values": ["待办", "进行中", "审核", "已完成"],
        "description": "任务当前状态，对应不同的列",
        "filterable": True,
    },
    {
        "name": "priority",
        "display_name": "优先级",
        "type": "enum",
        "values": ["high", "medium", "low"],
        "display_values": {"high": "高", "medium": "中", "low": "低"},
        "description": "任务优先级，高优先级需要优先处理",
        "filterable": True,
    },
    {
        "name": "assignee",
        "display_name": "负责人",
        "type": "string",
        "description": "任务负责人姓名",
        "filterable": True,
    },
    {
        "name": "dueDate",
        "display_name": "截止日期",
        "type": "date",
        "description": "任务截止日期，格式为 YYYY-MM-DD",
        "filterable": True,
    },
    {
        "name": "progress",
        "display_name": "进度",
        "type": "integer",
        "range": "0-100",
        "description": "任务完成进度百分比，0表示未开始，100表示完成",
        "filterable": True,
    },
    {
        "name": "progressText",
        "display_name": "进度说明",
        "type": "string",
        "description": "进度的文字描述",
        "filterable": False,
    },
    {
        "name": "tags",
        "display_name": "标签",
        "type": "array",
        "description": "任务标签列表，用于分类",
        "filterable": True,
    },
    {
        "name": "overdue",
        "display_name": "是否逾期",
        "type": "boolean",
        "description": "截止日期已过且状态不是已完成",
        "filterable": True,
    },
    {
        "name": "createdAt",
        "display_name": "创建时间",
        "type": "datetime",
        "description": "任务创建时间",
        "filterable": False,
    },
    {
        "name": "updatedAt",
        "display_name": "更新时间",
        "type": "datetime",
        "description": "任务最后更新时间",
        "filterable": False,
    },
]

# 可筛选维度
QUERY_DIMENSIONS = [
    {"name": "status", "display_name": "按状态筛选", "description": "筛选指定状态的任务"},
    {"name": "priority", "display_name": "按优先级筛选", "description": "筛选指定优先级的任务"},
    {"name": "assignee", "display_name": "按负责人筛选", "description": "筛选指定负责人的任务"},
    {"name": "overdue", "display_name": "筛选逾期任务", "description": "筛选已逾期但未完成的任务"},
    {"name": "tags", "display_name": "按标签筛选", "description": "筛选包含指定标签的任务"},
]

# 允许的查询参数（白名单）
ALLOWED_FILTERS = {
    "status",
    "priority",
    "assignee",
    "overdue",
    "tags",
}

# 优先级映射
PRIORITY_DISPLAY = {"high": "高", "medium": "中", "low": "低"}

# 状态映射（从 columnId 到显示名称）
STATUS_MAPPING = {
    "col-1": "待办",
    "col-2": "进行中",
    "col-3": "审核",
    "col-4": "已完成",
}

# 反向映射
STATUS_REVERSE_MAPPING = {v: k for k, v in STATUS_MAPPING.items()}
