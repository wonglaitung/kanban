#!/bin/bash
# Kanban Docker 构建脚本
# 看板镜像构建脚本 - 包含 Harness SDK

set -e

IMAGE_NAME=${1:-kanban-board}
HARNESS_SDK_PATH="/data/harness/packages/sdk"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 检查 Harness SDK 是否存在
if [ ! -d "$HARNESS_SDK_PATH" ]; then
    echo "错误: Harness SDK 不存在于 $HARNESS_SDK_PATH"
    echo "请先安装 Harness SDK"
    exit 1
fi

# 创建临时构建目录
BUILD_DIR=$(mktemp -d)
echo "创建临时构建目录: $BUILD_DIR"

# 进入项目目录复制文件
cd "$SCRIPT_DIR"
cp -r . "$BUILD_DIR/" 2>/dev/null || true

# 复制 Harness SDK 到构建上下文
echo "复制 Harness SDK..."
mkdir -p "$BUILD_DIR/harness-sdk"
cp -r "$HARNESS_SDK_PATH"/* "$BUILD_DIR/harness-sdk/"

# 进入临时目录并清理不需要的文件
cd "$BUILD_DIR"
rm -rf .git node_modules server/node_modules .env
rm -rf ai-service/.harness ai-service/__pycache__ ai-service/config/__pycache__

# 修改 .dockerignore，允许 harness-sdk 进入构建上下文
sed -i '/harness-sdk\/$/d' .dockerignore 2>/dev/null || sed -i '' '/harness-sdk\/$/d' .dockerignore

# 验证文件
echo "构建上下文文件列表:"
ls -la
echo ""
echo "harness-sdk 目录:"
ls -la harness-sdk/ | head -5

# 构建镜像
echo ""
echo "构建 Docker 镜像..."
docker build -t "$IMAGE_NAME" .

# 清理临时目录
echo "清理临时目录..."
cd "$SCRIPT_DIR"
rm -rf "$BUILD_DIR"

echo "构建完成: $IMAGE_NAME"