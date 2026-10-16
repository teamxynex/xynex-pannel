#!/bin/bash
# =========================================================
# XyneX Panel - Show Installation Logs
# Usage: bash show-install-logs.sh
# Run this from inside your XyneX-Panel folder.
# =========================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; }

LOG_DIR=".data/install-logs"
SERVERS_FILE=".data/servers.json"

if [ ! -d "$LOG_DIR" ]; then
    err "No install-logs folder found at $LOG_DIR — run this from your XyneX-Panel directory."
    exit 1
fi

LOG_COUNT=$(ls -1 "$LOG_DIR" 2>/dev/null | wc -l)
if [ "$LOG_COUNT" -eq 0 ]; then
    warn "No installation logs found yet. Try creating/reinstalling the server again first."
    exit 0
fi

echo "=========================================="
echo " Found $LOG_COUNT installation log(s)"
echo "=========================================="

for logfile in "$LOG_DIR"/*.log; do
    SERVER_ID=$(basename "$logfile" .log)

    # Try to look up a friendlier server name from servers.json
    SERVER_NAME="$SERVER_ID"
    if [ -f "$SERVERS_FILE" ] && command -v node &> /dev/null; then
        FOUND_NAME=$(node -e "
          try {
            const servers = JSON.parse(require('fs').readFileSync('$SERVERS_FILE', 'utf8'));
            const s = servers.find(s => s.id === '$SERVER_ID');
            if (s) console.log(s.name || s.id);
          } catch (e) {}
        " 2>/dev/null)
        if [ -n "$FOUND_NAME" ]; then
            SERVER_NAME="$FOUND_NAME"
        fi
    fi

    echo ""
    echo "------------------------------------------"
    echo " Server: $SERVER_NAME  (id: $SERVER_ID)"
    echo "------------------------------------------"
    cat "$logfile"
    echo ""
done

echo "=========================================="
echo " End of logs."
echo "=========================================="
echo "Copy the relevant section above (especially any line mentioning"
echo "'not found', 'no such file', 'permission denied', or an explicit"
echo "'exit 2' / error message from the egg's own script) and share it."
