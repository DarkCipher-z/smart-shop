# Multi-stage production Dockerfile
FROM node:24-alpine AS builder

WORKDIR /app

# Copy root and client dependency specifications
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies
RUN npm install
RUN cd client && npm install

# Copy source code
COPY . .

# Build client production bundle
RUN cd client && npm run build

# Production image
FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Copy root package and install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy server code and built client bundle
COPY server/ ./server/
COPY --from=builder /app/client/dist ./client/dist

# Expose port
EXPOSE 3001

# Run server
CMD ["node", "server/index.js"]
