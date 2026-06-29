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

# Install runtime dependencies (nginx only, Python comes from ai-builder)
RUN apk add --no-cache nginx sqlite-libs

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

# Copy frontend build
COPY --from=frontend-builder /app/dist ./dist

# Create data directories for SQLite and AI service with proper permissions
RUN mkdir -p /app/server/data /app/server/data/downloads /app/ai-service/data && \
    chmod -R 755 /app/server/data /app/ai-service/data

# Create nginx config with proper MIME types and AI API proxy
RUN echo 'events { worker_connections 1024; } \
http { \
    include /etc/nginx/mime.types; \
    default_type application/octet-stream; \
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
            proxy_connect_timeout 30s; \
        } \
        \
        location /api/ai { \
            proxy_pass http://127.0.0.1:3002; \
            proxy_http_version 1.1; \
            proxy_set_header Host $host; \
            proxy_set_header X-Real-IP $remote_addr; \
            proxy_read_timeout 300s; \
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
            alias /app/server/data/downloads/; \
            autoindex on; \
        } \
    } \
}' > /etc/nginx/nginx.conf

# Ensure downloads directory has proper permissions for file generation
RUN chmod -R 777 /app/server/data/downloads

# Create startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'cd /app/server && node server.js &' >> /app/start.sh && \
    echo 'cd /app/ai-service && python3 main.py &' >> /app/start.sh && \
    echo 'nginx -g "daemon off;"' >> /app/start.sh && \
    chmod +x /app/start.sh

EXPOSE 80

CMD ["/app/start.sh"]
