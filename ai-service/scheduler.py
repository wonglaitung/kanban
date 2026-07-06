"""
Scheduler - 定时任务调度配置

使用 Harness SDK Trigger 系统配置定时任务。
"""

import os
from pathlib import Path

from harness.triggers.cron import CronTrigger
from harness.triggers.manager import TriggerManager
from harness.triggers.types import TriggerAction


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
        # 生产模式：周一至周五17:00触发
        schedule = "0 17 * * 1-5"
        print("✅ 生产模式：定时任务周一至周五17:00触发")

    # 创建 TriggerAction
    action = TriggerAction(
        goal="""执行工作日任务提醒流程，生成完整的HTML格式邮件报告：

1. 查询所有进行中和已完成的任务
2. 按以下固定格式生成报告：

## 📊 任务进度日报
报告时间：{YYYY-MM-DD HH:mm}

### 一、进行中任务 ({数量})
表格列出：任务名称、负责人、进度、截止日期、状态（正常/即将到期/逾期）

### 二、风险提示
分类列出：
- 🔴 逾期任务：已过截止日期的任务
- 🟡 即将到期（3天内）：列出剩余天数
- 🟠 进度滞后（<50%）：进度低于50%的任务

### 三、优先级建议
具体、可操作的建议，如：
1. 优先处理 xxx，距离截止日期仅剩 x 天
2. xxx 需要加快进度，当前仅完成 x%

### 四、本周完成情况
列出本周已完成的任务及完成时间

### 五、下周计划
列出待办列中即将开始的任务

3. 调用 send_email 工具发送邮件（必须使用 HTML 格式）""",
        workspace_dir=str(Path(__file__).parent.parent / "server" / "data"),
        skills=["kanban-assistant"],
        max_iterations=50,
        timeout_seconds=300,
    )

    daily_reminder = CronTrigger(
        schedule=schedule,
        action=action,
        timezone="Asia/Shanghai",
        trigger_id="daily-task-reminder",
    )

    manager.register(daily_reminder)
    print(f"📅 定时任务已注册: {daily_reminder.id} ({schedule})")

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