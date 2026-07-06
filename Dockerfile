# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy frontend package files
COPY package*.json ./

# Install frontend dependencies
RUN npm ci

# Copy frontend source
COPY . .

# Build frontend
RUN npm run build

# Stage 2: Build AI service
FROM python:3.10-alpine AS ai-builder

WORKDIR /app/ai-service

# Install build dependencies
RUN apk add --no-cache gcc musl-dev

# Set fixed tiktoken cache directory (must match final image path)
ENV TIKTOKEN_CACHE_DIR=/app/tiktoken_cache

# Copy AI service requirements and install first
COPY ai-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy Harness SDK from build context and install
COPY harness-sdk/ /tmp/harness-sdk/
RUN pip install --no-cache-dir /tmp/harness-sdk && rm -rf /tmp/harness-sdk

# Pre-download tiktoken encoding files for offline environments
RUN mkdir -p /app/tiktoken_cache && \
    python -c "import tiktoken; tiktoken.get_encoding('cl100k_base')"

# Copy AI service code
COPY ai-service/ ./

# Stage 3: Build backend with native dependencies
FROM node:20-alpine AS backend-builder

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app/server

# Copy server package files
COPY server/package*.json ./

# Install backend dependencies
RUN npm ci

# Stage 4: Production image
FROM node:20-alpine

# Install runtime dependencies (nginx with headers-more module to hide server info)
RUN apk add --no-cache nginx nginx-mod-http-headers-more sqlite-libs tzdata

# Set timezone to Asia/Shanghai
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# Copy backend from builder
COPY --from=backend-builder /app/server/node_modules ./server/node_modules
COPY server/*.js ./server/
COPY server/package.json ./server/

# Copy Python runtime and AI service from builder
COPY --from=ai-builder /usr/local /usr/local
COPY --from=ai-builder /app/ai-service ./ai-service

# Copy tiktoken cache for offline environments
COPY --from=ai-builder /app/tiktoken_cache /app/tiktoken_cache
ENV TIKTOKEN_CACHE_DIR=/app/tiktoken_cache

# Disable Python stdout buffering for proper logging in Docker
ENV PYTHONUNBUFFERED=1

# Copy frontend build
COPY --from=frontend-builder /app/dist ./dist

# Create data directories for SQLite (downloads use /tmp/downloads to avoid mount permission issues)
RUN mkdir -p /app/server/data /app/ai-service/data && \
    chmod -R 755 /app/server/data /app/ai-service/data

# Create nginx config with proper MIME types and AI API proxy
RUN echo 'load_module /usr/lib/nginx/modules/ngx_http_headers_more_filter_module.so; \
events { worker_connections 1024; } \
http { \
    include /etc/nginx/mime.types; \
    default_type application/octet-stream; \
    server_tokens off; \
    more_clear_headers "Server"; \
    more_clear_headers "X-Powered-By"; \
    \
    server { \
        listen 80; \
        root /app/dist; \
        index index.html; \
        \
        location / { \
            try_files $uri $uri/ /index.html; \
        } \
        \
        location /api { \
            proxy_pass http://127.0.0.1:3001; \
            proxy_http_version 1.1; \
            proxy_set_header Upgrade $http_upgrade; \
            proxy_set_header Connection "upgrade"; \
            proxy_set_header Host $host; \
            proxy_read_timeout 60s; \
            proxy_connect_timeout 60s; \
        } \
        \
        location /api/ai { \
            proxy_pass http://127.0.0.1:3002; \
            proxy_http_version 1.1; \
            proxy_set_header Host $host; \
            proxy_set_header X-Real-IP $remote_addr; \
            proxy_read_timeout 900s; \
            proxy_connect_timeout 60s; \
            proxy_send_timeout 300s; \
        } \
        \
        location /ws { \
            proxy_pass http://127.0.0.1:3003; \
            proxy_http_version 1.1; \
            proxy_set_header Upgrade $http_upgrade; \
            proxy_set_header Connection "upgrade"; \
            proxy_set_header Host $host; \
            proxy_read_timeout 3600s; \
        } \
        \
        location /downloads/ { \
            alias /tmp/downloads/; \
            autoindex on; \
        } \
    } \
}' > /etc/nginx/nginx.conf

# Create startup script with proper logging
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'mkdir -p /tmp/downloads && chmod 755 /tmp/downloads' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Start backend server (logs to stdout)' >> /app/start.sh && \
    echo 'cd /app/server && node server.js 2>&1 &' >> /app/start.sh && \
    echo 'echo "Backend server started"' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Start AI service (logs to stdout)' >> /app/start.sh && \
    echo 'cd /app/ai-service && python3 main.py 2>&1 &' >> /app/start.sh && \
    echo 'echo "AI service started"' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Start nginx in foreground (main process)' >> /app/start.sh && \
    echo 'exec nginx -g "daemon off;"' >> /app/start.sh && \
    chmod +x /app/start.sh

EXPOSE 80

CMD ["/app/start.sh"]
