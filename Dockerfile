# Multi-stage build для оптимизации размера образа
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем package files
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем исходный код
COPY . .

# Компилируем TypeScript
RUN npm run build

# Production образ
FROM node:20-alpine

# Устанавливаем yt-dlp и ffmpeg
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    && pip3 install --break-system-packages --no-cache-dir yt-dlp

WORKDIR /app

# Копируем package files и устанавливаем только production зависимости
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Копируем скомпилированный код из builder
COPY --from=builder /app/dist ./dist

# Создаем non-root пользователя
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Порт для health checks
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Запуск приложения
CMD ["node", "dist/index.js"]
