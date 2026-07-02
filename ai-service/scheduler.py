"""
Scheduler - 定时任务调度配置

使用 Harness SDK Trigger 系统配置定时任务。
"""

import os
from pathlib import Path

from harness.triggers.cron import CronTrigger
from harness.triggers.manager import TriggerManager


def setup_scheduler(agent) -> TriggerManager:
    """
    配置定时任务调度器

    Args:
        agent: AgentHarness 实例

    Returns:
        TriggerManager 实例
    """
    manager = TriggerManager(agent)

    # 通过环境变量切换测试/生产模式
    test_mode = os.environ.get("TEST_MODE", "false").lower() == "true"

    if test_mode:
        # 测试模式：每1分钟触发
        schedule = "*/1 * * * *"
        print("⚠️ 测试模式：定时任务每1分钟触发")
    else:
        # 生产模式：每天17:00触发
        schedule = "0 17 * * *"
        print("✅ 生产模式：定时任务每天17:00触发")

    daily_reminder = CronTrigger(
        name="daily-task-reminder",
        schedule=schedule,
        timezone="Asia/Shanghai",
        task="检查所有进行中的任务，分析进度和潜在风险，提供优先级建议，生成HTML格式的邮件并发送提醒",
        skills=["kanban-assistant"],
    )

    manager.register(daily_reminder)
    print(f"📅 定时任务已注册: {daily_reminder.name} ({schedule})")

    return manager


async def start_scheduler(agent):
    """
    启动定时任务调度器

    Args:
        agent: AgentHarness 实例
    """
    manager = setup_scheduler(agent)
    await manager.start()
    print("🚀 定时任务调度器已启动")
    return manager


async def stop_scheduler(manager: TriggerManager):
    """
    停止定时任务调度器

    Args:
        manager: TriggerManager 实例
    """
    await manager.stop()
    print("🛑 定时任务调度器已停止")