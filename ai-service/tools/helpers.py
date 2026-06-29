"""
工具辅助函数

提供 API 调用和数据处理功能。
"""

import json
import os
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

# 后端 API 地址
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:3001")

# 下载目录（用于存放生成的报告文件）
# Docker 中使用 /tmp/downloads，不挂载到宿主机，避免权限问题
DOWNLOADS_DIR = Path(os.environ.get("DOWNLOADS_DIR", "/tmp/downloads"))
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)


def call_backend_api(
    method: str, path: str, data: Optional[dict] = None, params: Optional[dict] = None
) -> dict:
    """
    调用后端 API

    Args:
        method: HTTP 方法 (GET/POST/PUT/DELETE)
        path: API 路径 (如 /api/tasks)
        data: 请求体数据
        params: 查询参数

    Returns:
        API 响应数据
    """
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
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        return {"success": False, "error": f"API 错误 {e.code}: {error_body}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_columns_mapping() -> tuple[dict, dict]:
    """
    动态获取列映射

    Returns:
        (title_to_id, id_to_title) 两个映射字典
    """
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
    # 已完成的任务不算逾期
    if status == "已完成":
        return False
    try:
        if "T" in due_date:
            due = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
        else:
            due = datetime.strptime(due_date, "%Y-%m-%d")
            due = due.replace(hour=23, minute=59, second=59)

        now = datetime.now()
        return due < now
    except (ValueError, TypeError):
        return False
