#!/bin/bash
# Kanban Docker 运行脚本
# 看板容器启动脚本

set -e

CONTAINER_NAME="kanban"
IMAGE_NAME="kanban-board"

# 从 .env 文件加载环境变量（用于宿主机）
if [ -f ".env" ]; then
    # 导出 .env 中的变量到当前 shell
    set -a
    source .env
    set +a
fi

# 默认端口 80，可通过 .env 设置 DOCKER_PORT
DOCKER_PORT=${DOCKER_PORT:-80}

# 检查镜像是否存在
if ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
    echo "镜像 $IMAGE_NAME 不存在，正在构建..."
    docker build -t "$IMAGE_NAME" .
fi

# 检查 .env 文件是否存在
if [ ! -f ".env" ]; then
    echo "警告: .env 文件不存在，AI 服务可能无法正常工作"
    echo "请复制 .env.example 并配置 API 密钥:"
    echo "  cp .env.example .env"
    echo "  编辑 .env 配置 API_KEY、API_BASE_URL、AI_MODEL"
fi

# 停止并删除旧容器（如果存在）
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "停止并删除旧容器..."
    docker stop "$CONTAINER_NAME" &>/dev/null || true
    docker rm "$CONTAINER_NAME" &>/dev/null || true
fi

# 数据目录使用项目下的 server/data
DATA_DIR="$(cd "$(dirname "$0")" && pwd)/server/data"
mkdir -p "$DATA_DIR"

# 运行容器
echo "启动容器..."
docker run --name "$CONTAINER_NAME" \
    -p "$DOCKER_PORT:80" \
    --env-file .env \
    -v "$DATA_DIR:/app/server/data" \
    -v "$DATA_DIR:/app/ai-service/data" \
    "$IMAGE_NAME"

echo "容器已启动，访问 http://localhost:$DOCKER_PORT"