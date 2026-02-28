#!/usr/bin/env bash
# install.sh — one-stop setup for app-screen-mcp
# Usage: bash install.sh

set -euo pipefail

BOLD=$(tput bold 2>/dev/null || true)
RESET=$(tput sgr0 2>/dev/null || true)
GREEN=$(tput setaf 2 2>/dev/null || true)
YELLOW=$(tput setaf 3 2>/dev/null || true)
RED=$(tput setaf 1 2>/dev/null || true)

info()  { echo "${GREEN}▶${RESET} $*"; }
warn()  { echo "${YELLOW}⚠ $*${RESET}"; }
error() { echo "${RED}✗ $*${RESET}" >&2; exit 1; }
step()  { echo; echo "${BOLD}$*${RESET}"; }

# ── 1. Platform check ────────────────────────────────────────────────────────
step "Checking platform…"
[[ "$(uname)" == "Darwin" ]] || error "app-screen-mcp requires macOS."
info "macOS $(sw_vers -productVersion)"

# ── 2. Xcode Command Line Tools ──────────────────────────────────────────────
step "Checking Xcode Command Line Tools…"
if xcode-select -p &>/dev/null; then
  info "Xcode CLT: $(xcode-select -p)"
else
  warn "Xcode Command Line Tools not found. Installing…"
  xcode-select --install
  echo "  Re-run this script after the installer finishes."
  exit 0
fi

# ── 3. Homebrew ───────────────────────────────────────────────────────────────
step "Checking Homebrew…"
if command -v brew &>/dev/null; then
  info "brew $(brew --version | head -1 | awk '{print $2}')"
else
  warn "Homebrew not found. Installing…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # shellcheck disable=SC2016
  eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv 2>/dev/null)"
fi

# ── 4. Node.js ────────────────────────────────────────────────────────────────
step "Checking Node.js (>=18)…"
if command -v node &>/dev/null; then
  NODE_VER=$(node --version | tr -d 'v')
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
  if [[ "$NODE_MAJOR" -ge 18 ]]; then
    info "node v${NODE_VER}"
  else
    warn "Node.js v${NODE_VER} is too old. Installing latest LTS via Homebrew…"
    brew install node
  fi
else
  warn "Node.js not found. Installing via Homebrew…"
  brew install node
fi

# ── 5. idb-companion (via Homebrew) ──────────────────────────────────────────
step "Checking idb-companion…"
if brew list --formula 2>/dev/null | grep -q '^idb-companion$'; then
  info "idb-companion already installed"
else
  info "Installing idb-companion…"
  brew tap facebook/fb
  brew install idb-companion
fi

# ── 6. idb Python client ─────────────────────────────────────────────────────
step "Checking idb Python client…"
if command -v idb &>/dev/null; then
  info "idb $(idb --version 2>/dev/null || echo 'found')"
else
  info "Installing fb-idb Python client…"
  if command -v pip3 &>/dev/null; then
    pip3 install fb-idb --break-system-packages 2>/dev/null \
      || pip3 install fb-idb
  elif command -v pip &>/dev/null; then
    pip install fb-idb --break-system-packages 2>/dev/null \
      || pip install fb-idb
  else
    error "pip/pip3 not found. Install Python 3 first: brew install python"
  fi
fi

# ── 7. Install app-screen-mcp ─────────────────────────────────────────────────
step "Installing app-screen-mcp…"
npm install -g app-screen-mcp
MCP_BIN=$(npm root -g)/app-screen-mcp/dist/index.js
info "Installed → ${MCP_BIN}"

# ── 8. Print MCP config snippet ───────────────────────────────────────────────
step "Setup complete!"
cat <<EOF

${BOLD}Add the following to your MCP client config:${RESET}

  Claude Desktop  →  ~/Library/Application Support/Claude/claude_desktop_config.json
  Cursor / VS Code →  .cursor/mcp.json  or  .vscode/mcp.json

${BOLD}Config snippet:${RESET}
{
  "mcpServers": {
    "ios-simulator": {
      "command": "node",
      "args": ["${MCP_BIN}"]
    }
  }
}

${BOLD}Claude Code (CLI) — skip permission prompts:${RESET}
Add to ~/.claude/settings.json:
{
  "permissions": {
    "allow": ["mcp__ios-simulator__*"]
  }
}

${GREEN}All done. Restart your MCP client to activate the server.${RESET}
EOF
