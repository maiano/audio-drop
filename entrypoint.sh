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

# Test connection
if timeout 10 wget -q --spider --proxy=socks5://localhost:1080 https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null; then
  echo "✅ WARP proxy is ready!"
  wget -qO- --proxy=socks5://localhost:1080 https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null | grep -E "warp=|colo="
else
  echo "⚠️  WARP proxy check failed, but continuing..."
fi

echo "🤖 Starting Telegram bot..."
cd /app

# Start Node.js app (it will use WARP_PROXY_URL=socks5://localhost:1080)
exec node dist/index.js
