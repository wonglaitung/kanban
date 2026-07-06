"""
SendEmailTool - 发送邮件提醒工具
"""

import json
import os
import smtplib
from typing import Any

from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from harness.tools.base import Tool, ToolContext
from harness.types import ToolResult


class SendEmailTool(Tool):
    """发送邮件提醒工具"""

    @property
    def name(self) -> str:
        return "send_email"

    @property
    def description(self) -> str:
        return (
            "发送邮件提醒。用于发送任务分析报告。"
            "参数：subject（邮件主题）、content_html（HTML格式内容）、content_text（纯文本内容）。"
            "收件人从系统配置中获取。"
        )

    @property
    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "subject": {
                    "type": "string",
                    "description": "邮件主题，默认为'任务进度提醒'",
                },
                "content_html": {
                    "type": "string",
                    "description": "邮件内容（HTML格式），邮件客户端不支持Markdown，请使用HTML格式",
                },
                "content_text": {
                    "type": "string",
                    "description": "邮件内容（纯文本格式），作为备选",
                },
            },
            "required": ["content_html"],
        }

    async def execute(
        self, arguments: dict[str, Any], context: ToolContext
    ) -> ToolResult:
        """执行邮件发送"""
        subject = arguments.get("subject", "任务进度提醒")
        content_html = arguments.get("content_html")
        content_text = arguments.get("content_text", "")

        # 从环境变量获取配置
        smtp_server = os.environ.get("SMTP_SERVER")
        smtp_port = int(os.environ.get("SMTP_PORT", 25))
        smtp_user = os.environ.get("SMTP_USER", "")
        smtp_pass = os.environ.get("SMTP_PASSWORD", "")
        require_auth = os.environ.get("SMTP_REQUIRE_AUTH", "true").lower() == "true"
        recipients_str = os.environ.get("RECIPIENTS", "")

        if not smtp_server:
            return ToolResult(
                tool_call_id="",
                success=False,
                content="",
                error="SMTP 配置不完整，请检查 SMTP_SERVER 环境变量",
            )

        # 只有需要认证时才检查用户名密码
        if require_auth and (not smtp_user or not smtp_pass):
            return ToolResult(
                tool_call_id="",
                success=False,
                content="",
                error="SMTP 认证需要 SMTP_USER 和 SMTP_PASSWORD，或设置 SMTP_REQUIRE_AUTH=false",
            )

        if not recipients_str:
            return ToolResult(
                tool_call_id="",
                success=False,
                content="",
                error="未配置收件人，请检查 RECIPIENTS 环境变量",
            )

        recipients = [r.strip() for r in recipients_str.split(",") if r.strip()]

        if not recipients:
            return ToolResult(
                tool_call_id="",
                success=False,
                content="",
                error="收件人列表为空",
            )

        # 根据端口选择连接方式
        # 465: SSL 直连
        # 587: STARTTLS
        # 25: 无加密或 STARTTLS
        use_ssl = smtp_port == 465
        use_starttls = smtp_port == 587

        # 构建邮件
        msg = MIMEMultipart("alternative")
        msg["From"] = smtp_user
        msg["To"] = ", ".join(recipients)
        msg["Subject"] = subject

        # 添加纯文本内容（如果有）
        if content_text:
            msg.attach(MIMEText(content_text, "plain", "utf-8"))

        # 添加 HTML 内容
        msg.attach(MIMEText(content_html, "html", "utf-8"))

        # 发送邮件（带重试机制）
        max_attempts = 3
        last_error = None

        for attempt in range(max_attempts):
            try:
                # 根据端口选择连接方式
                if use_ssl:
                    server = smtplib.SMTP_SSL(smtp_server, smtp_port, timeout=30)
                else:
                    server = smtplib.SMTP(smtp_server, smtp_port, timeout=30)
                    if use_starttls:
                        server.starttls()

                # 只在需要认证时登录
                if require_auth and smtp_user and smtp_pass:
                    server.login(smtp_user, smtp_pass)

                server.sendmail(smtp_user or smtp_server, recipients, msg.as_string())
                server.quit()

                print(f"✅ 邮件发送成功：{subject} -> {', '.join(recipients)}")
                return ToolResult(
                    tool_call_id="",
                    success=True,
                    content=json.dumps({
                        "success": True,
                        "message": f"邮件已发送至 {len(recipients)} 人",
                        "recipients": recipients,
                        "subject": subject,
                    }, ensure_ascii=False),
                )

            except Exception as e:
                last_error = str(e)
                print(f"❌ 邮件发送失败 (尝试 {attempt + 1}/{max_attempts}): {e}")
                if attempt < max_attempts - 1:
                    import time
                    time.sleep(5)

        return ToolResult(
            tool_call_id="",
            success=False,
            content="",
            error=f"邮件发送失败（尝试 {max_attempts} 次）: {last_error}",
        )
