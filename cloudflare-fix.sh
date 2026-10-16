#!/bin/bash
# =========================================================
# XyneX Panel - Cloudflare Tunnel Diagnose & Fix
# Usage:
#   bash cloudflare-fix.sh YOUR_TUNNEL_TOKEN
# =========================================================

set -uo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; }

TOKEN="${1:-}"

echo "=========================================="
echo " Cloudflare Tunnel Diagnose & Fix"
echo "=========================================="

# 1. Check cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    warn "cloudflared is not installed. Installing now..."
    ARCH=$(uname -m)
    CF_ARCH="amd64"
    if [ "$ARCH" == "aarch64" ] || [ "$ARCH" == "arm64" ]; then
        CF_ARCH="arm64"
    fi
    if command -v apt-get &> /dev/null; then
        curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}.deb"
        sudo dpkg -i /tmp/cloudflared.deb || sudo apt-get install -f -y
    elif command -v yum &> /dev/null; then
        curl -fsSL -o /tmp/cloudflared.rpm "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}.rpm"
        sudo yum install -y /tmp/cloudflared.rpm
    else
        err "Could not detect apt or yum. Install cloudflared manually: https://pkg.cloudflare.com/"
        exit 1
    fi
fi

if command -v cloudflared &> /dev/null; then
    ok "cloudflared is installed: $(cloudflared --version 2>/dev/null | head -n1)"
else
    err "cloudflared installation failed. Stopping."
    exit 1
fi

# 2. Show current service status (before touching anything)
echo ""
log "Current service status (before fix):"
sudo systemctl status cloudflared --no-pager 2>&1 | head -n 15 || warn "No existing cloudflared service found."

# 3. If no token given, just show diagnostics and stop here
if [ -z "$TOKEN" ]; then
    echo ""
    warn "No token was passed in, so I only ran diagnostics — nothing was changed."
    echo ""
    log "Recent logs (last 50 lines):"
    sudo journalctl -u cloudflared -n 50 --no-pager 2>&1 || warn "No logs found (service was probably never installed)."
    echo ""
    echo "To install/reconnect with a token, run:"
    echo "  bash cloudflare-fix.sh YOUR_TUNNEL_TOKEN"
    exit 0
fi

# 4. Clean token (strip accidental whitespace/newlines/quotes)
CLEAN_TOKEN=$(echo -n "$TOKEN" | tr -d '[:space:]' | tr -d "'\"")

if [ ${#CLEAN_TOKEN} -lt 20 ]; then
    err "That token looks too short (${#CLEAN_TOKEN} chars) — did the copy get cut off? Grab it again from Cloudflare Zero Trust > Networks > Tunnels > your tunnel > Configure."
    exit 1
fi

# 5. Remove any previous (possibly broken) install and reinstall fresh
echo ""
log "Removing any previous cloudflared service..."
sudo cloudflared service uninstall &> /dev/null || true
sleep 1

log "Installing cloudflared service with the provided token..."
if sudo cloudflared service install "$CLEAN_TOKEN"; then
    ok "Service install command succeeded."
else
    err "Service install command failed — see the error above."
    exit 1
fi

sleep 3

# 6. Verify it actually came up
echo ""
log "Service status after install:"
sudo systemctl status cloudflared --no-pager 2>&1 | head -n 15

if sudo systemctl is-active --quiet cloudflared; then
    ok "cloudflared service is ACTIVE and running."
else
    err "Service installed but is NOT active. Showing recent logs to find out why:"
    sudo journalctl -u cloudflared -n 50 --no-pager 2>&1
    echo ""
    warn "Common causes: token expired/revoked (generate a fresh one in the Cloudflare dashboard), or this tunnel was already connected from another machine."
    exit 1
fi

echo ""
echo "=========================================="
ok "Cloudflare Tunnel connected successfully!"
echo "=========================================="
echo "Next step: in Cloudflare Zero Trust dashboard, open this tunnel's"
echo "'Public Hostname' tab and set your domain -> Service: http://localhost:6767"
echo "(or use the panel's Admin Panel > Playit Tunnel > Cloudflare Tunnel"
echo "section, which can do this step for you via the Cloudflare API)."
