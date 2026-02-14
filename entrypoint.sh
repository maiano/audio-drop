#!/bin/sh
set -e

echo "🚀 Starting WARP proxy setup..."

WARP_DIR="/app/.warp"
WARP_CONF="$WARP_DIR/wgcf-profile.conf"
WIREPROXY_CONF="$WARP_DIR/wireproxy.conf"

# Generate WARP config if not exists
if [ ! -f "$WARP_CONF" ]; then
  echo "📝 Generating WARP account..."
  cd "$WARP_DIR"

  # Accept ToS and register
  echo | wgcf register --accept-tos

  # Generate WireGuard profile
  wgcf generate

  echo "✅ WARP config created"
fi

# Extract config values
PRIVATE_KEY=$(grep 'PrivateKey' "$WARP_CONF" | cut -d' ' -f3)
ADDRESS=$(grep 'Address' "$WARP_CONF" | head -n1 | cut -d' ' -f3)
PUBLIC_KEY=$(grep 'PublicKey' "$WARP_CONF" | cut -d' ' -f3)
ENDPOINT=$(grep 'Endpoint' "$WARP_CONF" | cut -d' ' -f3)

# Create wireproxy config
cat > "$WIREPROXY_CONF" <<EOF
[Interface]
PrivateKey = $PRIVATE_KEY
Address = $ADDRESS
DNS = 1.1.1.1, 1.0.0.1

[Peer]
PublicKey = $PUBLIC_KEY
Endpoint = $ENDPOINT
AllowedIPs = 0.0.0.0/0

[Socks5]
BindAddress = 127.0.0.1:1080
EOF

echo "🔌 Starting WireProxy SOCKS5 on localhost:1080..."
wireproxy -c "$WIREPROXY_CONF" &
WIREPROXY_PID=$!

# Wait for proxy to be ready
echo "⏳ Waiting for WARP proxy..."
sleep 5

# Test connection and diagnostics
echo "🔍 Testing WARP proxy..."
if timeout 10 wget -q --spider --proxy=socks5://localhost:1080 https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null; then
  echo "✅ WARP proxy is ready!"
  echo "📊 WARP Info:"
  wget -qO- --proxy=socks5://localhost:1080 https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null | grep -E "warp=|colo=|ip="

  # Check external IP
  echo "🌐 External IP via WARP:"
  IP_OUT=$(wget -qO- --proxy=socks5://localhost:1080 --timeout=10 https://ifconfig.me 2>/dev/null || echo "failed")
  echo "Proxy IP: $IP_OUT"

  # Test YouTube access
  echo "🔍 Testing YouTube access:"
  YT_CODE=$(wget --proxy=socks5://localhost:1080 -S -O /dev/null https://www.youtube.com 2>&1 | grep "HTTP/" | tail -1 | awk '{print $2}' || echo "failed")
  echo "YouTube HTTP: $YT_CODE"
else
  echo "⚠️  WARP proxy check failed, but continuing..."
fi

# Check Node.js for yt-dlp JS runtime
echo "🔍 Checking Node.js runtime:"
NODE_PATH=$(which node)
NODE_VERSION=$(node --version 2>/dev/null || echo "not found")
echo "Node.js path: $NODE_PATH"
echo "Node.js version: $NODE_VERSION"

# Test iOS client if requested (doesn't need cookies or PO Token)
if [ "$TEST_IOS_CLIENT" = "true" ]; then
  echo "🧪 Testing iOS client with WARP proxy..."
  yt-dlp \
    --proxy socks5://localhost:1080 \
    --extractor-args "youtube:player_client=ios" \
    --dump-json \
    --no-warnings \
    "https://youtu.be/ELKbtFljucQ" | head -20
  echo "✅ Test complete"
  echo "Sleeping for 2 minutes to review logs..."
  sleep 120
  exit 0
fi

echo "🤖 Starting Telegram bot..."
cd /app

# Start Node.js app (it will use WARP_PROXY_URL=socks5://localhost:1080)
exec node dist/index.js
