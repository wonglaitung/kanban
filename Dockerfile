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
RUN echo '#!/bin/sh\njson-server --watch db.json --port 3001 --host 0.0.0.0 &\nnpx vite preview --port 80 --host 0.0.0.0' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 80 3001

CMD ["/app/start.sh"]
