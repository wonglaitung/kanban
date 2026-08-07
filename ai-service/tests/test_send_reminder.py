"""
send-reminder 手动补发邮件接口集成测试

验证核心行为（不依赖 Harness SDK / API Key / SMTP）：
1. 未配置 Agent 时立即返回失败
2. 配置 Agent 时立即返回成功，后台任务触发 agent.run(REMINDER_GOAL)
3. 接口不等后台任务完成（触发即忘）
"""

import asyncio
import sys
import time
import types
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

# 确保能导入 main（main.py 同目录）
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import main  # noqa: E402


@pytest.fixture(autouse=True)
def _inject_fake_scheduler():
    """
    _run_reminder 内部 `from scheduler import REMINDER_GOAL` 会导入 harness SDK，
    测试环境无 SDK，注入假的 scheduler 模块避免导入失败。
    """
    fake = types.ModuleType("scheduler")
    fake.REMINDER_GOAL = "任务进度日报 测试目标"
    original = sys.modules.get("scheduler")
    sys.modules["scheduler"] = fake
    yield fake
    if original is not None:
        sys.modules["scheduler"] = original
    else:
        del sys.modules["scheduler"]


def test_send_reminder_no_agent_returns_failure():
    """未配置 Agent（无 API Key）时立即返回失败"""

    async def scenario():
        with patch.object(main, "get_or_create_agent", AsyncMock(return_value=None)):
            resp = await main.send_reminder()
            return resp

    resp = asyncio.run(scenario())
    assert resp["success"] is False
    assert "API Key" in resp["error"]


def test_send_reminder_schedules_background_task():
    """配置 Agent 时返回成功，并在后台调用 agent.run(REMINDER_GOAL)"""

    agent = AsyncMock()
    agent.run = AsyncMock(return_value=None)

    async def scenario():
        with patch.object(main, "get_or_create_agent", AsyncMock(return_value=agent)):
            resp = await main.send_reminder()
        # 等待后台任务执行到 agent.run
        deadline = time.monotonic() + 3
        while agent.run.await_count == 0 and time.monotonic() < deadline:
            await asyncio.sleep(0.05)
        return resp

    resp = asyncio.run(scenario())

    assert resp["success"] is True
    assert agent.run.await_count == 1
    args, kwargs = agent.run.call_args
    assert args[0] == "任务进度日报 测试目标"
    assert kwargs["session_id"].startswith("send-reminder-")


def test_send_reminder_returns_before_task_finishes():
    """接口立即返回，不等后台慢任务（触发即忘）"""

    class SlowAgent:
        async def run(self, *args, **kwargs):
            await asyncio.sleep(2)
            return None

    async def scenario():
        with patch.object(main, "get_or_create_agent", AsyncMock(return_value=SlowAgent())):
            start = time.monotonic()
            resp = await main.send_reminder()
            elapsed = time.monotonic() - start
            return resp, elapsed

    resp, elapsed = asyncio.run(scenario())
    assert resp["success"] is True
    assert elapsed < 1.0  # 后台任务需 2s，接口必须远早于此返回
