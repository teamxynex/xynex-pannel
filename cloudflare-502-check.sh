#!/bin/bash
# =========================================================
# XyneX Panel - Cloudflare 502 (Bad Gateway) Diagnose
# Usage: bash cloudflare-502-check.sh
# =========================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; }

echo "=========================================="
echo " Cloudflare 502 Diagnose (Host: Error)"
echo "=========================================="

# 1. Is the panel process even running (pm2)?
echo ""
log "PM2 process list:"
pm2 list 2>&1 || warn "pm2 not found or not running as this user."

# 2. What PORT is set in .env?
echo ""
log ".env PORT setting:"
if [ -f ".env" ]; then
    grep -i "^PORT=" .env || echo "(no PORT= line found in .env — panel defaults to 6767)"
else
    warn "No .env file found in current directory. Run this from your panel folder."
fi

# 3. Is anything actually listening on 6767?
echo ""
log "Checking if port 6767 is listening locally:"
if command -v ss &> /dev/null; then
    ss -tlnp 2>/dev/null | grep ":6767" || warn "Nothing is listening on port 6767!"
elif command -v netstat &> /dev/null; then
    netstat -tlnp 2>/dev/null | grep ":6767" || warn "Nothing is listening on port 6767!"
else
    warn "Neither ss nor netstat found — skipping port check."
fi

# 4. Try to actually curl the panel locally
echo ""
log "Trying to reach http://localhost:6767 directly:"
if command -v curl &> /dev/null; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:6767 2>&1)
    if [ "$HTTP_CODE" == "000" ]; then
        err "Could not connect to localhost:6767 at all — the panel is NOT running or not listening on this port."
    else
        ok "Got HTTP $HTTP_CODE from localhost:6767 — panel IS reachable locally."
    fi
else
    warn "curl not found — cannot test directly."
fi

# 5. cloudflared service status + recent logs
echo ""
log "cloudflared service status:"
sudo systemctl status cloudflared --no-pager 2>&1 | head -n 12

echo ""
log "cloudflared recent logs (last 30 lines):"
sudo journalctl -u cloudflared -n 30 --no-pager 2>&1

echo ""
echo "=========================================="
echo " Summary / What to do"
echo "=========================================="
echo "- If 'localhost:6767' failed above: your panel process is down or on a"
echo "  different port. Check: pm2 list , pm2 logs , and your .env PORT value."
echo "  Restart with: pm2 restart all  (or pm2 start dist/server.cjs --name xynex)"
echo ""
echo "- If localhost:6767 IS reachable but Cloudflare still shows 502: the"
echo "  Public Hostname in Cloudflare's dashboard may be pointed at the wrong"
echo "  port/protocol. It must be exactly: http://localhost:6767 (not https)."
echo ""
echo "- If cloudflared logs show connection refused/timeout errors: cloudflared"
echo "  and the panel must be on the SAME machine/host network namespace."
