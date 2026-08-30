#!/bin/bash

# =========================================================
# XyneX Panel - Automated Installation & Management Script
# Repository: https://github.com/teamxynex/xynex-pannel
# =========================================================

set -e

# Colors for UI
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m' # No Color

INSTALLER_VERSION="2.0"

# ---------------------------------------------------------------------------
# Status helpers used by the banner/menu so the operator can see, at a
# glance, whether the panel is already installed and whether it's running —
# without having to run a separate command first.
# ---------------------------------------------------------------------------
find_panel_dir() {
    if [ -f "package.json" ] && grep -q "xynex-panel" "package.json" 2>/dev/null; then
        echo "."
    elif [ -d "xynex-pannel" ] && [ -f "xynex-pannel/package.json" ]; then
        echo "xynex-pannel"
    elif [ -d "XyneX-Panel" ] && [ -f "XyneX-Panel/package.json" ]; then
        echo "XyneX-Panel"
    else
        echo ""
    fi
}

get_panel_status_line() {
    local dir
    dir="$(find_panel_dir)"
    if [ -z "$dir" ]; then
        echo -e "${BLUE}Panel:${NC} ${YELLOW}not installed yet${NC}"
        return
    fi

    local port="6767"
    if [ -f "$dir/.env" ]; then
        local env_port
        env_port=$(grep -m1 '^PORT=' "$dir/.env" 2>/dev/null | cut -d'=' -f2)
        [ -n "$env_port" ] && port="$env_port"
    fi

    local running="stopped"
    local status_color="$YELLOW"
    if command -v pm2 &> /dev/null || npx pm2 -v &> /dev/null 2>&1; then
        if npx pm2 jlist 2>/dev/null | grep -q '"name":"xynex-panel".*"status":"online"'; then
            running="online"
            status_color="$GREEN"
        fi
    fi

    # Prefer, in order: a Cloudflare Tunnel domain configured from the
    # panel's own Admin Panel -> Cloudflare Tunnel settings, then a
    # CodeSandbox preview URL if this is running inside a CodeSandbox
    # container, then finally falling back to the raw server IP.
    local url=""

    local cf_domain=""
    if [ -f "$dir/.data/settings.json" ]; then
        cf_domain=$(grep -o '"cloudflareDomain"[[:space:]]*:[[:space:]]*"[^"]*"' "$dir/.data/settings.json" 2>/dev/null | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/')
    fi

    if [ -n "$cf_domain" ]; then
        url="https://${cf_domain}"
    elif [ -n "$CODESANDBOX_HOST" ]; then
        url="https://${port}-${CODESANDBOX_HOST}"
    else
        local ip
        ip=$(curl -fsSL -m 2 https://ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
        url="http://${ip:-<server-ip>}:${port}"
    fi

    echo -e "${BLUE}Panel:${NC} ${status_color}${running}${NC} ${BLUE}·${NC} ${BLUE}Port:${NC} ${port} ${BLUE}·${NC} ${BLUE}URL:${NC} ${url}"
}

print_banner() {
    clear
    echo -e "${BLUE}${BOLD}"
    echo "  ╔════════════════════════════════════════════════════════╗"
    echo "  ║                                                        ║"
    echo "  ║   __   __              _____                           ║"
    echo "  ║   \\ \\ / /   _ _ __   ___|_   _|                        ║"
    echo "  ║    \\ V / | | | '_ \\ / _ \\| |                           ║"
    echo "  ║     | || |_| | | | |  __/| |                           ║"
    echo "  ║     |_| \\__, |_| |_|\\___||_|                           ║"
    echo "  ║         |___/                                          ║"
    echo "  ║                                                        ║"
    echo "  ║          XYNEX PANEL MANAGEMENT & INSTALLER            ║"
    echo "  ╚════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo -e "  ${BLUE}v${INSTALLER_VERSION}${NC}"
    echo -e "  $(get_panel_status_line)"
    echo ""
}

# A single filling progress line shown once when the script starts, before
# the banner/menu appear — gives immediate feedback that the command is
# doing something instead of a blank pause.
show_loading_bar() {
    local width=40
    local delay=0.02
    clear
    echo ""
    echo -e "  ${BLUE}${BOLD}Loading XyneX Panel Installer...${NC}"
    echo ""
    local bar=""
    for ((i = 1; i <= width; i++)); do
        bar+="█"
        local empty=""
        for ((k = 0; k < width - i; k++)); do empty+="░"; done
        printf "\r  ${BLUE}[%s%s] %3d%%${NC}" "$bar" "$empty" "$((i * 100 / width))"
        sleep "$delay"
    done
    echo ""
    sleep 0.2
}

# ---------------------------------------------------------------------------
# Runs a (possibly noisy) shell command with its raw output hidden, showing
# a single filling progress line in its place instead. All real
# stdout/stderr from the command is captured to a temp log file — invisible
# on success, but printed (last 40 lines) automatically if the command
# fails, so nothing needed for debugging is actually lost.
#
# The percentage is a smooth visual estimate (it doesn't parse npm/apt's
# own internal progress) that eases toward ~90% while the command is still
# running and snaps to 100% the moment it finishes — enough to reassure
# the operator that something is actively happening without drowning them
# in apt/npm log spam.
# ---------------------------------------------------------------------------
run_with_progress() {
    local label="$1"
    local cmd="$2"
    local width=30
    local logfile
    logfile=$(mktemp)

    ( eval "$cmd" ) > "$logfile" 2>&1 &
    local pid=$!

    local pct=0
    while kill -0 "$pid" 2>/dev/null; do
        # Ease toward 90% asymptotically so long-running commands don't
        # look stuck at a fixed number, but never falsely claim 100% until
        # the command has actually finished.
        pct=$(( pct + ( (90 - pct) / 6 + 1 ) ))
        [ "$pct" -gt 90 ] && pct=90
        local filled=$(( pct * width / 100 ))
        local bar=""
        for ((k = 0; k < filled; k++)); do bar+="█"; done
        local empty=""
        for ((k = filled; k < width; k++)); do empty+="░"; done
        printf "\r  ${BLUE}%s [%s%s] %3d%%${NC}  " "$label" "$bar" "$empty" "$pct"
        sleep 0.3
    done

    local status=0
    wait "$pid" || status=$?

    if [ $status -eq 0 ]; then
        local bar=""
        for ((k = 0; k < width; k++)); do bar+="█"; done
        printf "\r  ${GREEN}%s [%s] 100%%${NC}%*s\n" "$label" "$bar" 5 ""
    else
        printf "\r  ${RED}%s failed.${NC}%*s\n" "$label" 40 ""
        log_error "\"$label\" failed — last 40 lines of output:"
        echo -e "${DIM}"
        tail -n 40 "$logfile"
        echo -e "${NC}"
    fi

    rm -f "$logfile"
    return $status
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_warning "This script is recommended to be run as root or with sudo."
    fi
}

install_panel() {
    print_banner
    echo -e "${BOLD}--- [1] Full Panel Installation ---${NC}\n"

    check_root
    log_info "Updating system packages and installing dependencies..."

    if command -v apt-get &> /dev/null; then
        run_with_progress "Updating & installing base packages" \
            'sudo apt-get update -y; sudo apt-get install -y curl git build-essential ca-certificates unrar p7zip-full; command -v unrar &> /dev/null || sudo apt-get install -y unrar-free' || true
    elif command -v yum &> /dev/null; then
        run_with_progress "Updating & installing base packages" \
            'sudo yum update -y; sudo yum install -y curl git make gcc-c++ ca-certificates unrar p7zip' || true
    fi

    # Setup and install Node.js 20.x if not already at least v20
    if ! command -v node &> /dev/null || [ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 20 ]; then
        if ! run_with_progress "Installing Node.js 20.x" \
            'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -; sudo apt-get install -y nodejs'; then
            log_error "Node.js installation failed — the panel can't run without it. Fix the error above and try again."
            return
        fi
    else
        log_success "Node.js $(node -v) is already installed."
    fi
    
    # Install PM2 globally
    if ! command -v pm2 &> /dev/null; then
        if ! run_with_progress "Installing PM2" 'sudo npm install -g pm2; npm install pm2 -D'; then
            log_error "PM2 installation failed — the panel is started/managed through PM2. Fix the error above and try again."
            return
        fi
    else
        log_success "PM2 is already installed."
    fi

    # Docker or Podman Setup
    echo -e "\n${BLUE}==========================================${NC}"
    echo -e "${BOLD}Select Server Engine for the panel:${NC}"
    echo "1) Docker (Requires systemd/systemctl)"
    echo "2) Podman (Daemonless, better for some VPS/Sandbox environments)"
    echo "3) Native — No Docker/Podman. Runs servers as plain processes on this host directly."
    read -p "Choose engine (1/2/3) [default: 1]: " ENGINE_CHOICE

    SELECTED_ENGINE="docker"
    XYNEX_ENGINE_VALUE=""
    if [ "$ENGINE_CHOICE" == "3" ]; then
        SELECTED_ENGINE="native"
        XYNEX_ENGINE_VALUE="native"
        log_info "Native mode selected — no Docker/Podman will be installed."
        log_info "Servers run directly on this machine instead of in containers."
        log_warning "Uploaded Pterodactyl eggs work out of the box in native mode (their install script handles everything)."
        log_warning "Quick-create PAPER/PURPUR/VELOCITY/WATERFALL/VANILLA download their own jar automatically."
        log_warning "Other quick-create types (Spigot/Forge/Fabric/Bedrock) need an uploaded egg in native mode."

        if ! command -v java &> /dev/null; then
            read -p "Java wasn't found and most game servers need it — install OpenJDK 21 now? (y/n) [default: y]: " INSTALL_JAVA
            if [ "$INSTALL_JAVA" != "n" ] && [ "$INSTALL_JAVA" != "N" ]; then
                if command -v apt-get &> /dev/null; then
                    run_with_progress "Installing OpenJDK 21" 'sudo apt-get install -y openjdk-21-jre-headless || sudo apt-get install -y default-jre-headless' || true
                elif command -v yum &> /dev/null; then
                    run_with_progress "Installing OpenJDK 21" 'sudo yum install -y java-21-openjdk-headless || sudo yum install -y java-latest-openjdk-headless' || true
                fi
            fi
        else
            log_success "Java is already installed ($(java -version 2>&1 | head -n1))."
        fi
    elif [ "$ENGINE_CHOICE" == "2" ]; then
        SELECTED_ENGINE="podman"
        if ! command -v podman &> /dev/null; then
            if command -v apt-get &> /dev/null; then
                run_with_progress "Installing Podman" 'sudo apt-get install -y podman podman-docker' || true
            elif command -v yum &> /dev/null; then
                run_with_progress "Installing Podman" 'sudo yum install -y podman podman-docker' || true
            fi
        fi
        if command -v podman &> /dev/null; then
            log_success "Podman installed successfully!"
            if ! [ -S /run/podman/podman.sock ]; then
                log_info "Starting Podman API socket..."
                sudo mkdir -p /run/podman
                nohup sudo podman system service --time=0 unix:///run/podman/podman.sock &> /dev/null &
            fi
        else
            log_error "Podman installation failed."
        fi
    else
        if ! command -v docker &> /dev/null; then
            run_with_progress "Installing Docker" \
                'curl -fsSL https://get.docker.com | sh; command -v systemctl &> /dev/null && sudo systemctl enable --now docker' || true
        else
            log_success "Docker is already installed."
        fi
    fi


    # Cloudflare Tunnel Setup (optional)
    echo -e "\n${BLUE}==========================================${NC}"
    echo -e "${BOLD}Cloudflare Tunnel (optional):${NC}"
    echo "This exposes the panel securely without opening ports, using a domain you manage in Cloudflare."
    read -p "Set up a Cloudflare Tunnel now? (y/n) [default: n]: " SETUP_CF

    if [[ "$SETUP_CF" == "y" || "$SETUP_CF" == "Y" ]]; then
        if ! command -v cloudflared &> /dev/null; then
            ARCH=$(uname -m)
            CF_ARCH="amd64"
            if [ "$ARCH" == "aarch64" ] || [ "$ARCH" == "arm64" ]; then
                CF_ARCH="arm64"
            fi
            if command -v apt-get &> /dev/null; then
                run_with_progress "Installing cloudflared" \
                    "curl -fsSL -o /tmp/cloudflared.deb 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}.deb'; sudo dpkg -i /tmp/cloudflared.deb || sudo apt-get install -f -y" || true
            elif command -v yum &> /dev/null; then
                run_with_progress "Installing cloudflared" \
                    "curl -fsSL -o /tmp/cloudflared.rpm 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}.rpm'; sudo yum install -y /tmp/cloudflared.rpm" || true
            fi
        fi

        if command -v cloudflared &> /dev/null; then
            log_success "cloudflared installed: $(cloudflared --version 2>/dev/null | head -n1)"
            read -p "Paste your Cloudflare Tunnel token (from Zero Trust > Networks > Tunnels): " CF_TOKEN
            if [ -n "$CF_TOKEN" ]; then
                sudo cloudflared service uninstall &> /dev/null || true
                sudo cloudflared service install "$CF_TOKEN" && log_success "Cloudflare Tunnel connected!" || log_warning "Could not install the cloudflared service — you can retry later from the Admin Panel's Cloudflare Tunnel section."
                log_info "To attach your domain: open the tunnel in the Cloudflare Zero Trust dashboard -> Public Hostname -> set Service to http://localhost:6767 and enable 'No TLS Verify' under Additional application settings > TLS."
            else
                log_warning "No token entered — skipping Cloudflare Tunnel setup."
            fi
        else
            log_error "cloudflared installation failed. You can install it manually later."
        fi
    fi

    log_info "Downloading and setting up the XyneX Panel..."
    
    # Check if we are already in the XyneX directory
    if [ -f "package.json" ] && grep -q "xynex-panel" "package.json" 2>/dev/null; then
        log_info "Running setup in current directory..."
        WORK_DIR="."
    elif [ -d "xynex-pannel" ] && [ -d "XyneX-Panel" ]; then
        log_warning "Found BOTH 'xynex-pannel' and 'XyneX-Panel' folders — this is almost certainly the cause of any 'file not found' or 'wrong version running' issues you've seen."
        log_warning "Using 'xynex-pannel' and ignoring 'XyneX-Panel'. Delete whichever one you don't want with: rm -rf XyneX-Panel"
        WORK_DIR="xynex-pannel"
    elif [ -d "xynex-pannel" ]; then
        log_info "The 'xynex-pannel' folder already exists. Running setup inside it..."
        WORK_DIR="xynex-pannel"
    elif [ -d "XyneX-Panel" ]; then
        log_info "The 'XyneX-Panel' folder already exists. Running setup inside it..."
        WORK_DIR="XyneX-Panel"
    else
        WORK_DIR="xynex-pannel"
        run_with_progress "Cloning XyneX Panel from GitHub" \
            "GIT_TERMINAL_PROMPT=0 git clone https://github.com/teamxynex/xynex-pannel.git $WORK_DIR" \
            || { log_error "Clone failed. Check the repository URL/visibility."; return; }
    fi
    
    # Navigate into the directory
    cd "$WORK_DIR" || { log_error "Failed to enter the directory!"; return; }
    
    # Ensure .env exists
    if [ ! -f ".env" ]; then
        log_info "Setting up .env file..."
        if [ -f ".env.example" ]; then
            cp .env.example .env
        else
            echo "PORT=6767" > .env
            echo "JWT_SECRET=$(head -c 32 /dev/urandom | base64)" >> .env
        fi
    fi
    
    # Save or update CONTAINER_ENGINE in .env
    if grep -q "CONTAINER_ENGINE=" .env 2>/dev/null; then
        sed -i "s/CONTAINER_ENGINE=.*/CONTAINER_ENGINE=$SELECTED_ENGINE/" .env
    else
        echo "CONTAINER_ENGINE=$SELECTED_ENGINE" >> .env
    fi

    # Save or update XYNEX_ENGINE in .env (only meaningful value today is
    # "native" — panel auto-detects Docker/Podman otherwise, so this is
    # left blank for those two choices rather than writing "docker"/"podman").
    if grep -q "XYNEX_ENGINE=" .env 2>/dev/null; then
        sed -i "s/XYNEX_ENGINE=.*/XYNEX_ENGINE=$XYNEX_ENGINE_VALUE/" .env
    else
        echo "XYNEX_ENGINE=$XYNEX_ENGINE_VALUE" >> .env
    fi
    
    # Ensure ecosystem.config.cjs exists for PM2
    if [ ! -f "ecosystem.config.cjs" ]; then
        log_info "Creating PM2 ecosystem file..."
cat << 'EOF' > ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "xynex-panel",
      script: "npm",
      args: "start",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 6767
      }
    }
  ]
};
EOF
    fi

    if ! run_with_progress "Installing Node.js dependencies" "npm i"; then
        log_error "Dependency install failed. Fix the error above and re-run (Option 1 or Option 3 once the folder exists)."
        [ "$WORK_DIR" != "." ] && cd .. || true
        return
    fi

    if ! run_with_progress "Building panel" "npm run build"; then
        log_error "Build failed. Fix the error above and re-run (Option 1 or Option 3 once the folder exists)."
        [ "$WORK_DIR" != "." ] && cd .. || true
        return
    fi

    echo ""
    log_info "Let's create your first admin account:"
    npm run createuser
    
    # Always clear out any previously-running instance (possibly from an
    # older/different clone of this panel) before starting fresh, so there
    # is never more than one xynex-panel process running at once.
    npx pm2 delete xynex-panel &> /dev/null || true

    if ! run_with_progress "Starting panel with PM2" "npx pm2 start ecosystem.config.cjs && npx pm2 save"; then
        log_error "PM2 failed to start the panel. Fix the error above, then run: npx pm2 start ecosystem.config.cjs (from inside $WORK_DIR)."
        [ "$WORK_DIR" != "." ] && cd .. || true
        return
    fi
    
    log_success "=========================================="
    log_success " Panel successfully installed and started!"
    log_success " Access URL: http://<YOUR-SERVER-IP>:6767"
    log_success " Working directory: $(pwd)"
    log_success "=========================================="
    
    # Return to the main directory
    if [ "$WORK_DIR" != "." ]; then
        cd ..
    fi
}

install_node() {
    print_banner
    echo -e "${BOLD}--- [2] Install Node (remote VPS daemon) ---${NC}\n"
    echo "This registers THIS machine as a Node against an existing XyneX Panel"
    echo "(created under Admin Panel -> Nodes -> Create Node on the panel side)."
    echo ""

    check_root
    NODE_DIR="xynex-node"
    mkdir -p "$NODE_DIR"

    read -p "Auto configure node? (y/n) [default: y]: " AUTO_CONFIGURE
    AUTO_CONFIGURE=${AUTO_CONFIGURE:-y}

    read -p "Panel URL (e.g. https://mypanel.mydomain.com): " PANEL_URL
    PANEL_URL="${PANEL_URL%/}" # strip trailing slash
    read -p "Node UUID: " NODE_UUID
    read -p "Token ID: " NODE_TOKEN_ID
    read -p "Token: " NODE_TOKEN

    if [ -z "$PANEL_URL" ] || [ -z "$NODE_UUID" ] || [ -z "$NODE_TOKEN_ID" ] || [ -z "$NODE_TOKEN" ]; then
        log_error "Panel URL, Node UUID, Token ID, and Token are all required. Copy these from the panel's Admin Panel -> Nodes -> (your node) -> Configuration tab."
        return
    fi

    # Save the node's own copy of its credentials so the heartbeat loop
    # (and any future re-runs of this installer) can reuse them.
    cat > "$NODE_DIR/node.env" << EOF
PANEL_URL=$PANEL_URL
NODE_UUID=$NODE_UUID
NODE_TOKEN_ID=$NODE_TOKEN_ID
NODE_TOKEN=$NODE_TOKEN
EOF
    chmod 600 "$NODE_DIR/node.env"

    if [[ "$AUTO_CONFIGURE" == "y" || "$AUTO_CONFIGURE" == "Y" ]]; then
        log_info "Registering this VPS as the daemon for node $NODE_UUID..."

        LINK_RESPONSE=$(curl -fsSL -X POST "$PANEL_URL/api/nodes/$NODE_UUID/link" \
            -H "Content-Type: application/json" \
            -d "{\"tokenId\":\"$NODE_TOKEN_ID\",\"token\":\"$NODE_TOKEN\"}" 2>&1) || {
            log_error "Failed to link node. Response: $LINK_RESPONSE"
            log_warning "Double-check the Panel URL is reachable from this VPS and that the Token ID/Token match the panel's Node Configuration tab exactly."
            return
        }

        if ! echo "$LINK_RESPONSE" | grep -q '"success":true'; then
            log_error "Panel rejected the link request: $LINK_RESPONSE"
            return
        fi

        log_success "Node linked with the panel!"

        # Minimal heartbeat loop: pings the panel every 30s so the node
        # stays marked Connected. This is the node daemon referenced in
        # the panel's Nodes table/status indicator.
        cat > "$NODE_DIR/heartbeat.sh" << 'HBEOF'
#!/bin/bash
set -a
source "$(dirname "$0")/node.env"
set +a
while true; do
    curl -fsSL -X POST "$PANEL_URL/api/nodes/$NODE_UUID/heartbeat" \
        -H "Content-Type: application/json" \
        -d "{\"tokenId\":\"$NODE_TOKEN_ID\",\"token\":\"$NODE_TOKEN\"}" > /dev/null 2>&1
    sleep 30
done
HBEOF
        chmod +x "$NODE_DIR/heartbeat.sh"

        log_info "Starting node daemon..."
        if command -v pm2 &> /dev/null || npx pm2 -v &> /dev/null 2>&1; then
            npx pm2 delete xynex-node &> /dev/null || true
            npx pm2 start "$NODE_DIR/heartbeat.sh" --name xynex-node --interpreter bash
            npx pm2 save || true
            log_success "Node daemon started with PM2 (process: xynex-node)."
        else
            log_warning "PM2 not found — falling back to a systemd service."
            SERVICE_PATH="/etc/systemd/system/xynex-node.service"
            sudo bash -c "cat > $SERVICE_PATH" << EOF
[Unit]
Description=XyneX Node Daemon
After=network.target

[Service]
Type=simple
ExecStart=/bin/bash $(pwd)/$NODE_DIR/heartbeat.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
            sudo systemctl daemon-reload
            sudo systemctl enable --now xynex-node
            log_success "Node daemon started via systemd (service: xynex-node)."
        fi

        log_success "=========================================="
        log_success " Node connected successfully!"
        log_success " The panel's Nodes table should now show this node as Connected."
        log_success "=========================================="
    else
        log_info "Manual setup selected — credentials saved to $NODE_DIR/node.env."
        log_info "This node will stay 'Not Connected' on the panel until you either:"
        echo "    1) Re-run this installer and choose Auto configure (y), or"
        echo "    2) Manually POST { tokenId, token } to $PANEL_URL/api/nodes/$NODE_UUID/link"
        echo "       and run $NODE_DIR/heartbeat.sh (create it yourself, or re-run with auto=y) to keep it alive."
    fi
}

update_panel() {
    print_banner
    echo -e "${BOLD}--- [3] Update XyneX Panel ---${NC}\n"

    WORK_DIR="$(find_panel_dir)"
    if [ -z "$WORK_DIR" ]; then
        log_error "Panel directory not found! Please install the panel first (Option 1)."
        return
    fi

    cd "$WORK_DIR" || { log_error "Failed to enter the directory!"; return; }

    if [ ! -d ".git" ]; then
        log_error "This folder isn't a git repository, so it can't be updated automatically."
        log_error "Re-install into a fresh folder with Option 1, or 'git clone' the repo yourself over this one."
        [ "$WORK_DIR" != "." ] && cd .. || true
        return
    fi

    # Make sure runtime config/data are never tracked by git, so an update
    # can never overwrite/delete your .env or your servers/users/ban data.
    if [ ! -f ".gitignore" ] || ! grep -qx "\.env" .gitignore 2>/dev/null; then
        { echo ".env"; echo ".data/"; echo "node_modules/"; echo "dist/"; echo "*.log"; } >> .gitignore
    fi
    for f in .env .data; do
        if [ -e "$f" ] && git ls-files --error-unmatch "$f" &> /dev/null; then
            log_warning "$f was tracked by git — untracking it (the file/folder itself is kept, just no longer version-controlled)."
            git rm -r --cached "$f" &> /dev/null || true
        fi
    done

    log_info "Fetching updates from GitHub..."
    if ! git fetch origin; then
        log_error "git fetch failed — check your network/DNS and that the remote is reachable."
        [ "$WORK_DIR" != "." ] && cd .. || true
        return
    fi

    DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
    [ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH="main"

    # A plain `git pull` fails with "refusing to merge unrelated histories"
    # when this folder wasn't created via an actual `git clone` of this repo
    # (e.g. it was uploaded/extracted and `git init`'d separately). Fall
    # back to a hard reset onto the fetched branch in that case — reset
    # only touches files git already tracks (untracked files like .env,
    # .data/, node_modules/ are never touched), so it sidesteps the
    # unrelated-histories/merge-conflict problem entirely.
    if ! git pull --ff-only origin "$DEFAULT_BRANCH" 2>/tmp/xynex_pull_err.log; then
        log_warning "Could not fast-forward — reconciling with a hard reset onto origin/$DEFAULT_BRANCH instead."
        if ! git diff --quiet || ! git diff --cached --quiet; then
            log_warning "Local changes to tracked files detected — stashing them first (recoverable with: git stash pop)."
            git stash push -m "xynex-installer auto-stash before update" &> /dev/null || true
        fi
        if ! git reset --hard "origin/$DEFAULT_BRANCH"; then
            log_error "Reset onto origin/$DEFAULT_BRANCH failed:"
            cat /tmp/xynex_pull_err.log 2>/dev/null
            [ "$WORK_DIR" != "." ] && cd .. || true
            return
        fi
        log_success "Repository reconciled with origin/$DEFAULT_BRANCH."
    fi

    if ! run_with_progress "Installing dependencies" "npm i"; then
        log_error "Dependency install failed. Fix the error above and try Update Panel again."
        [ "$WORK_DIR" != "." ] && cd .. || true
        return
    fi

    if ! run_with_progress "Rebuilding panel" "npm run build"; then
        log_error "Build failed. Fix the error above and try Update Panel again."
        [ "$WORK_DIR" != "." ] && cd .. || true
        return
    fi

    run_with_progress "Restarting PM2 process" "npx pm2 restart xynex-panel || npx pm2 restart all" || true
    
    log_success "Panel successfully updated and restarted!"
    
    if [ "$WORK_DIR" != "." ]; then
        cd ..
    fi
}

uninstall_panel() {
    print_banner
    echo -e "${BOLD}--- [3] Uninstall XyneX Panel ---${NC}\n"

    WORK_DIR="$(find_panel_dir)"
    if [ -z "$WORK_DIR" ]; then
        log_error "Panel directory not found! There's nothing to uninstall."
        return
    fi

    log_warning "This will stop the panel and permanently delete its folder (including .env and .data — users, servers, settings)."
    read -p "  Type 'yes' to confirm uninstall: " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        log_info "Uninstall cancelled."
        return
    fi

    if command -v pm2 &> /dev/null || npx pm2 -v &> /dev/null 2>&1; then
        log_info "Stopping and removing PM2 process..."
        npx pm2 delete xynex-panel &> /dev/null || true
        npx pm2 save &> /dev/null || true
    fi

    ABS_WORK_DIR="$(cd "$WORK_DIR" && pwd)"
    log_info "Removing panel directory ($ABS_WORK_DIR)..."
    rm -rf -- "$ABS_WORK_DIR"

    log_success "XyneX Panel has been uninstalled."
}

create_admin_user() {
    print_banner
    echo -e "${BOLD}--- [4] Create Admin User ---${NC}\n"
    
    if [ -f "package.json" ] && grep -q "xynex-panel" "package.json" 2>/dev/null; then
        WORK_DIR="."
    elif [ -d "xynex-pannel" ]; then
        WORK_DIR="xynex-pannel"
    elif [ -d "XyneX-Panel" ]; then
        WORK_DIR="XyneX-Panel"
    else
        log_error "Panel directory not found!"
        return
    fi
    
    cd "$WORK_DIR" || { log_error "Failed to enter the directory!"; return; }
    
    log_info "Running admin creation script..."
    npm run createuser
    
    if [ "$WORK_DIR" != "." ]; then
        cd ..
    fi
    log_success "Admin user created!"
}

restart_panel() {
    print_banner
    echo -e "${BOLD}--- [5] Restart XyneX Panel ---${NC}\n"
    
    log_info "Restarting panel..."
    if command -v pm2 &> /dev/null || npx pm2 -v &> /dev/null; then
        npx pm2 restart xynex-panel || npx pm2 restart all
        log_success "Panel restarted successfully!"
    else
        log_error "PM2 is not installed. Panel cannot be restarted via PM2."
    fi
}

show_install_logs() {
    print_banner
    echo -e "${BOLD}--- [6] Show Installation Logs ---${NC}\n"

    WORK_DIR="$(find_panel_dir)"
    if [ -z "$WORK_DIR" ]; then
        log_error "Panel directory not found! Please install the panel first (Option 1)."
        return
    fi

    if [ ! -f "$WORK_DIR/show-install-logs.sh" ]; then
        log_error "show-install-logs.sh not found in $WORK_DIR — pull the latest panel version first (Option 3)."
        return
    fi

    (cd "$WORK_DIR" && bash show-install-logs.sh)
}

# =========================================================
# Entry point
#
# Running the single install command with no arguments goes straight
# into the interactive menu below:
#   bash <(curl -fsSL https://raw.githubusercontent.com/teamxynex/xynex-pannel/main/install.sh)
#
# Non-interactive shortcuts are still available for scripting/automation
# (unchanged from before, plus 'node' for installing a node daemon):
#   bash install.sh install    -> Install Panel directly
#   bash install.sh node       -> Install Node directly
#   bash install.sh update     -> update + rebuild + restart
#   bash install.sh restart    -> restart via PM2
#   bash install.sh createuser -> create another admin user
#   bash install.sh logs       -> show installation logs
#   bash install.sh menu       -> interactive menu (same as no argument)
# =========================================================

ACTION="${1:-menu}"

# Show the loading animation once per run, right when the command starts —
# skipped when output isn't an interactive terminal (e.g. piped/logged).
if [ -t 1 ]; then
    show_loading_bar
fi

case "$ACTION" in
    install)
        install_panel
        ;;
    node)
        install_node
        ;;
    update)
        update_panel
        ;;
    restart)
        restart_panel
        ;;
    createuser)
        create_admin_user
        ;;
    logs)
        show_install_logs
        ;;
    menu)
        while true; do
            print_banner
            echo -e "  ${BLUE}┌──────────────────────────────────────────────────────┐${NC}"
            echo -e "  ${BLUE}│${NC}  ${BOLD}1)${NC} Install Panel                                    ${BLUE}│${NC}"
            echo -e "  ${BLUE}│${NC}  ${BOLD}2)${NC} Install Node ${BLUE}(remote VPS daemon)${NC}                 ${BLUE}│${NC}"
            echo -e "  ${BLUE}│${NC}  ${BOLD}3)${NC} Uninstall Panel                                  ${BLUE}│${NC}"
            echo -e "  ${BLUE}│${NC}  ${BOLD}4)${NC} Update Panel                                     ${BLUE}│${NC}"
            echo -e "  ${BLUE}│${NC}  ${BOLD}5)${NC} Create Admin User                                ${BLUE}│${NC}"
            echo -e "  ${BLUE}│${NC}  ${BOLD}6)${NC} Restart Panel                                    ${BLUE}│${NC}"
            echo -e "  ${BLUE}│${NC}  ${BOLD}7)${NC} Show Install Logs                                ${BLUE}│${NC}"
            echo -e "  ${BLUE}│${NC}  ${BOLD}8)${NC} Exit                                             ${BLUE}│${NC}"
            echo -e "  ${BLUE}└──────────────────────────────────────────────────────┘${NC}"
            read -p "  Choose an option (1-8): " CHOICE

            case "$CHOICE" in
                1)
                    install_panel
                    read -p "Press Enter to return to main menu..."
                    ;;
                2)
                    install_node
                    read -p "Press Enter to return to main menu..."
                    ;;
                3)
                    uninstall_panel
                    read -p "Press Enter to return to main menu..."
                    ;;
                4)
                    update_panel
                    read -p "Press Enter to return to main menu..."
                    ;;
                5)
                    create_admin_user
                    read -p "Press Enter to return to main menu..."
                    ;;
                6)
                    restart_panel
                    read -p "Press Enter to return to main menu..."
                    ;;
                7)
                    show_install_logs
                    read -p "Press Enter to return to main menu..."
                    ;;
                8)
                    echo -e "\n${YELLOW}Exiting script... Goodbye!${NC}\n"
                    exit 0
                    ;;
                *)
                    log_error "Invalid option! Please enter a number from 1 to 8."
                    sleep 1.5
                    ;;
            esac
        done
        ;;
    *)
        log_error "Unknown option '$ACTION'. Use one of: install, node, update, restart, createuser, logs, menu"
        exit 1
        ;;
esac
