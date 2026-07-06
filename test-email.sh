#!/bin/sh
# 邮件发送测试脚本
# 用法: ./test-email.sh [容器名]

CONTAINER_NAME="${1:-kanban}"

echo "=== 在容器 $CONTAINER_NAME 中测试邮件发送 ==="
echo ""

# 检查容器是否运行
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "❌ 容器 $CONTAINER_NAME 未运行"
    echo "请先启动容器: ./run-docker.sh"
    exit 1
fi

echo ">>> 检查环境变量..."
docker exec "$CONTAINER_NAME" sh -c '
echo "SMTP_SERVER=$SMTP_SERVER"
echo "SMTP_PORT=$SMTP_PORT"
echo "SMTP_REQUIRE_AUTH=$SMTP_REQUIRE_AUTH"
echo "SMTP_USER=$SMTP_USER"
echo "SMTP_PASSWORD=${SMTP_PASSWORD:0:3}***"
echo "RECIPIENTS=$RECIPIENTS"
'

echo ""
echo ">>> 测试发送邮件..."
docker exec "$CONTAINER_NAME" python3 -c "
import os
import smtplib
from email.mime.text import MIMEText
from datetime import datetime

smtp_server = os.environ.get('SMTP_SERVER', '')
smtp_port = int(os.environ.get('SMTP_PORT', 25))
smtp_user = os.environ.get('SMTP_USER', '')
smtp_pass = os.environ.get('SMTP_PASSWORD', '')
require_auth = os.environ.get('SMTP_REQUIRE_AUTH', 'true').lower() == 'true'
recipients = os.environ.get('RECIPIENTS', '')

if not smtp_server:
    print('❌ SMTP_SERVER 未配置')
    exit(1)

if not recipients:
    print('❌ RECIPIENTS 未配置')
    exit(1)

# 根据端口选择连接方式
use_ssl = smtp_port == 465
use_starttls = smtp_port == 587

print(f'服务器: {smtp_server}:{smtp_port}')
print(f'认证: {\"需要\" if require_auth else \"不需要\"}')
print(f'连接模式: {\"SSL\" if use_ssl else \"STARTTLS\" if use_starttls else \"明文\"}')
print()

try:
    # 连接服务器
    if use_ssl:
        server = smtplib.SMTP_SSL(smtp_server, smtp_port, timeout=30)
    else:
        server = smtplib.SMTP(smtp_server, smtp_port, timeout=30)
        if use_starttls:
            server.starttls()
    print('✅ 连接成功')

    # 认证（如果需要）
    if require_auth and smtp_user and smtp_pass:
        server.login(smtp_user, smtp_pass)
        print('✅ 认证成功')

    # 发送测试邮件
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    msg = MIMEText(f'SMTP 测试邮件\n发送时间: {timestamp}\n服务器: {smtp_server}:{smtp_port}', 'plain', 'utf-8')
    msg['Subject'] = f'SMTP 测试 [{timestamp}]'
    msg['From'] = smtp_user or smtp_server
    msg['To'] = recipients

    server.sendmail(smtp_user or smtp_server, recipients.split(','), msg.as_string())
    print(f'✅ 发送成功 -> {recipients}')
    server.quit()

except smtplib.SMTPAuthenticationError as e:
    print(f'❌ 认证失败: {e}')
    print('   请检查 SMTP_USER 和 SMTP_PASSWORD')
    print('   或设置 SMTP_REQUIRE_AUTH=false')
except smtplib.SMTPConnectError as e:
    print(f'❌ 连接失败: {e}')
    print('   请检查 SMTP_SERVER 和 SMTP_PORT')
except Exception as e:
    print(f'❌ 发送失败: {type(e).__name__}: {e}')
"

echo ""
echo "=== 测试完成 ==="
