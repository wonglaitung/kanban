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

# Create startup script - backend runs on 3001 (internal only), frontend on 80
RUN echo '#!/bin/sh\necho "Starting JSON Server on port 3001 (internal)..."\njson-server --watch db.json --port 3001 --host 0.0.0.0 &\necho "Starting Vite Preview on port 80..."\nnpx vite preview --port 80 --host 0.0.0.0' > /app/start.sh && chmod +x /app/start.sh

# Only expose frontend port - backend is accessed through frontend proxy
EXPOSE 80

CMD ["/app/start.sh"]