# Multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production image
FROM node:20-alpine

# Install dependencies for WARP + yt-dlp
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    curl \
    wget \
    wireguard-tools \
    iptables \
    nodejs \
    npm \
    && pip3 install --break-system-packages --no-cache-dir --upgrade yt-dlp

WORKDIR /tmp

# Download wgcf (WARP config generator)
RUN wget -O /usr/local/bin/wgcf https://github.com/ViRb3/wgcf/releases/download/v2.2.22/wgcf_2.2.22_linux_amd64 \
    && chmod +x /usr/local/bin/wgcf

# Download wireproxy (WireGuard to SOCKS5)
RUN wget -O wireproxy.tar.gz https://github.com/pufferffish/wireproxy/releases/download/v1.0.7/wireproxy_linux_amd64.tar.gz \
    && tar -xzf wireproxy.tar.gz \
    && mv wireproxy /usr/local/bin/wireproxy \
    && chmod +x /usr/local/bin/wireproxy \
    && rm wireproxy.tar.gz

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Create directories for WARP config
RUN mkdir -p /app/.warp && chmod 777 /app/.warp

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["/app/entrypoint.sh"]
