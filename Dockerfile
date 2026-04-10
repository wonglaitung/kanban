FROM node:18-alpine

WORKDIR /app

# Install json-server globally
RUN npm install -g json-server

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Create startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'echo "Starting JSON Server on port 3001..."' >> /app/start.sh && \
    echo 'json-server --watch db.json --port 3001 --host 0.0.0.0 &' >> /app/start.sh && \
    echo 'echo "Starting Vite Preview on port 80..."' >> /app/start.sh && \
    echo 'npx vite preview --port 80 --host 0.0.0.0' >> /app/start.sh && \
    chmod +x /app/start.sh

EXPOSE 80

CMD ["/bin/sh", "/app/start.sh"]
