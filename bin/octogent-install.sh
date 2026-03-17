#!/usr/bin/env bash
# ============================================================================
# Octogent Installer
# Autonomous Multi-Agent AI System
# Copyright (c) 2024 Octogent Labs. All rights reserved.
# Contact: Octogent@pm.me
# ============================================================================

set -e

VERSION="1.0.0"
REPO_URL="https://github.com/OctogentAI/Octogent"
INSTALL_DIR="${OCTOGENT_HOME:-$HOME/.octogent}"
BIN_DIR="/usr/local/bin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
   ____       _                         _   
  / __ \  ___| |_ ___   __ _  ___ _ __ | |_ 
 / / _` |/ __| __/ _ \ / _` |/ _ \ '_ \| __|
| | (_| | (__| || (_) | (_| |  __/ | | | |_ 
 \ \__,_|\___|\__\___/ \__, |\___|_| |_|\__|
  \____/               |___/                 
                                          
EOF
    echo -e "${NC}"
    echo -e "  ${GREEN}Installer v$VERSION${NC}"
    echo ""
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_os() {
    case "$(uname -s)" in
        Linux*)     OS="linux";;
        Darwin*)    OS="macos";;
        CYGWIN*|MINGW*|MSYS*) OS="windows";;
        *)          OS="unknown";;
    esac
    
    ARCH="$(uname -m)"
    case "$ARCH" in
        x86_64)  ARCH="amd64";;
        aarch64) ARCH="arm64";;
        arm64)   ARCH="arm64";;
    esac
    
    log_info "Detected OS: $OS ($ARCH)"
}

check_dependencies() {
    log_info "Checking dependencies..."
    
    # Check for curl or wget
    if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
        log_error "curl or wget is required but not installed."
        exit 1
    fi
    
    # Check for Node.js
    if ! command -v node &> /dev/null; then
        log_warn "Node.js not found. Installing..."
        install_nodejs
    else
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -lt 18 ]; then
            log_warn "Node.js version 18+ required. Found: $(node -v)"
            install_nodejs
        else
            log_info "Node.js $(node -v) found"
        fi
    fi
    
    # Check for Ollama
    if ! command -v ollama &> /dev/null; then
        log_warn "Ollama not found. Installing..."
        install_ollama
    else
        log_info "Ollama found"
    fi
}

install_nodejs() {
    log_info "Installing Node.js..."
    
    case "$OS" in
        macos)
            if command -v brew &> /dev/null; then
                brew install node
            else
                curl -fsSL https://nodejs.org/dist/v20.11.0/node-v20.11.0.pkg -o /tmp/node.pkg
                sudo installer -pkg /tmp/node.pkg -target /
                rm /tmp/node.pkg
            fi
            ;;
        linux)
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        *)
            log_error "Automatic Node.js installation not supported on $OS"
            log_error "Please install Node.js manually: https://nodejs.org/"
            exit 1
            ;;
    esac
}

install_ollama() {
    log_info "Installing Ollama..."
    
    case "$OS" in
        macos)
            if command -v brew &> /dev/null; then
                brew install ollama
            else
                curl -fsSL https://ollama.ai/install.sh | sh
            fi
            ;;
        linux)
            curl -fsSL https://ollama.ai/install.sh | sh
            ;;
        *)
            log_error "Automatic Ollama installation not supported on $OS"
            log_error "Please install Ollama manually: https://ollama.ai/"
            exit 1
            ;;
    esac
}

download_octogent() {
    log_info "Downloading Octogent..."
    
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    
    # Download release
    if command -v curl &> /dev/null; then
        curl -fsSL "$REPO_URL/releases/latest/download/octogent-$OS-$ARCH.tar.gz" -o octogent.tar.gz
    else
        wget -q "$REPO_URL/releases/latest/download/octogent-$OS-$ARCH.tar.gz" -O octogent.tar.gz
    fi
    
    tar -xzf octogent.tar.gz
    rm octogent.tar.gz
    
    log_info "Downloaded to $INSTALL_DIR"
}

install_cli() {
    log_info "Installing CLI..."
    
    # Make CLI executable
    chmod +x "$INSTALL_DIR/bin/octogent"
    
    # Create symlink
    if [ -w "$BIN_DIR" ]; then
        ln -sf "$INSTALL_DIR/bin/octogent" "$BIN_DIR/octogent"
    else
        sudo ln -sf "$INSTALL_DIR/bin/octogent" "$BIN_DIR/octogent"
    fi
    
    log_info "CLI installed to $BIN_DIR/octogent"
}

install_npm_package() {
    log_info "Installing npm package..."
    
    cd "$INSTALL_DIR"
    npm install --production
    
    log_info "Dependencies installed"
}

post_install() {
    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}  Octogent installed successfully!${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo "Quick start:"
    echo ""
    echo "  1. Initialize Octogent:"
    echo -e "     ${CYAN}octogent init${NC}"
    echo ""
    echo "  2. Start the agent:"
    echo -e "     ${CYAN}octogent start${NC}"
    echo ""
    echo "  3. Open the dashboard:"
    echo -e "     ${CYAN}http://localhost:8888${NC}"
    echo ""
    echo "Documentation: $REPO_URL"
    echo "Support: Octogent@pm.me"
    echo ""
}

uninstall() {
    log_info "Uninstalling Octogent..."
    
    # Stop if running
    if [ -f "$INSTALL_DIR/octogent.pid" ]; then
        local pid=$(cat "$INSTALL_DIR/octogent.pid")
        kill "$pid" 2>/dev/null || true
    fi
    
    # Remove symlink
    if [ -f "$BIN_DIR/octogent" ]; then
        if [ -w "$BIN_DIR" ]; then
            rm -f "$BIN_DIR/octogent"
        else
            sudo rm -f "$BIN_DIR/octogent"
        fi
    fi
    
    # Remove systemd service
    if [ -f /etc/systemd/system/octogent.service ]; then
        sudo systemctl stop octogent 2>/dev/null || true
        sudo systemctl disable octogent 2>/dev/null || true
        sudo rm -f /etc/systemd/system/octogent.service
        sudo systemctl daemon-reload
    fi
    
    # Remove install directory
    rm -rf "$INSTALL_DIR"
    
    log_info "Octogent uninstalled"
}

main() {
    print_banner
    
    case "${1:-install}" in
        install)
            check_os
            check_dependencies
            download_octogent
            install_cli
            install_npm_package
            post_install
            ;;
        uninstall)
            uninstall
            ;;
        *)
            echo "Usage: $0 [install|uninstall]"
            exit 1
            ;;
    esac
}

main "$@"
