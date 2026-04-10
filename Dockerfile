FROM node:18-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy server package files
COPY server/package.json ./server/
WORKDIR /app/server
RUN npm install

# Copy server code
COPY server/ ./

# Build frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Create data directory for SQLite
RUN mkdir -p /app/server/data

# Create startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'echo "Starting API Server on port 3001..."' >> /app/start.sh && \
    echo 'cd /app/server && npm start &' >> /app/start.sh && \
    echo 'echo "Starting Frontend on port 80..."' >> /app/start.sh && \
    echo 'cd /app && npx vite preview --port 80 --host 0.0.0.0' >> /app/start.sh && \
    chmod +x /app/start.sh

EXPOSE 80

CMD ["/app/start.sh"]