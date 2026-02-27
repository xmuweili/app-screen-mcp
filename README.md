<div align="center">
  <img src="./assets/banner.svg" alt="app-screen-mcp banner" width="100%" />

  <h1>app-screen-mcp</h1>
  <p><strong>Give AI agents eyes and hands on your iOS Simulator.</strong></p>
  <p>
    A production-ready <a href="https://modelcontextprotocol.io">Model Context Protocol (MCP)</a> server for simulator control,
    UI perception, and intelligent text-based interaction.
  </p>

  <p>
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-0A7EA4?style=flat-square&logo=typescript&logoColor=white" />
    <img alt="MCP" src="https://img.shields.io/badge/MCP-Compatible-0F766E?style=flat-square" />
    <img alt="Platform" src="https://img.shields.io/badge/Platform-macOS-1E3A8A?style=flat-square&logo=apple&logoColor=white" />
    <img alt="License" src="https://img.shields.io/badge/License-MIT-166534?style=flat-square" />
  </p>
</div>

## Why app-screen-mcp

Most mobile AI automation fails for one reason: it acts blind.

`app-screen-mcp` solves that by combining:
- Structured accessibility data (`idb ui describe-all`)
- Real simulator screenshots (`xcrun simctl io ... screenshot`)
- Direct simulator actions (tap, type, swipe, hardware buttons)

Result: agents that can understand screen state before acting, then execute deterministic interactions.

## What You Can Do

- Build autonomous QA flows for iOS simulators
- Run AI-driven smoke tests without brittle selectors
- Automate onboarding/login/payment demos from natural language
- Create self-healing UI scripts that use labels instead of fixed coordinates
- Feed accessibility tree + screenshot to multimodal models for stronger reasoning

## How It Works

```text
AI Agent / MCP Client
        |
        v
   app-screen-mcp
        |
        +--> idb (UI tree + gestures + text + buttons)
        |
        +--> xcrun simctl (device lifecycle + screenshots + app launch)
        |
        v
   iOS Simulator
```

## Feature Highlights

- Full simulator discovery and boot control
- App launch by bundle ID
- Accessibility-first perception via normalized UI elements
- Screenshot capture returned as MCP image content
- `tap_text` for semantic interaction by visible label
- `get_screen_summary` for one-call AI context (tree + screenshot)
- Safe text input escaping in shell execution path
- Tooling designed for Claude Desktop, Cursor, and any MCP-compatible client

## Tool Catalog

| Tool | Purpose |
|---|---|
| `list_simulators` | List available simulators and current boot state |
| `boot_simulator` | Boot a simulator by UDID |
| `launch_app` | Launch an installed app by `bundle_id` |
| `get_ui_tree` | Return full normalized accessibility tree |
| `take_screenshot` | Return current screen as base64 JPEG image |
| `get_screen_summary` | Return structured metadata + screenshot in one call |
| `tap` | Tap exact `(x, y)` coordinates |
| `type_text` | Type into currently focused field |
| `swipe` | Swipe between two points with optional duration |
| `press_button` | Press `HOME`, `LOCK`, `SIDE_BUTTON`, or `SIRI` |
| `find_elements` | Search UI elements by label/value/hint text |
| `tap_text` | Find first matching element by text and tap its center |

## Prerequisites

- macOS with Xcode + iOS Simulator
- Node.js 18+
- `idb` tooling

```bash
brew tap facebook/fb
brew install idb-companion
pip3 install fb-idb
```

## Installation

```bash
git clone https://github.com/xmuweili/app-screen-mcp.git
cd app-screen-mcp
npm install
npm run build
```

## Configure Your MCP Client

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ios-simulator": {
      "command": "node",
      "args": ["/absolute/path/to/app-screen-mcp/dist/index.js"]
    }
  }
}
```

### Cursor / VS Code MCP

```json
{
  "mcp.servers": {
    "ios-simulator": {
      "command": "node",
      "args": ["/absolute/path/to/app-screen-mcp/dist/index.js"]
    }
  }
}
```

Restart your MCP client after updating config.

## Skip Permission Prompts

Most MCP clients (Claude Desktop, Cursor, Windsurf, Zed, Continue.dev) treat adding the server to their config as the permission grant — tools run freely with no further prompts.

**Claude Code (CLI) is the exception.** It prompts for approval on every tool call by default. Fix it by adding this to `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "mcp__ios-simulator__*"
    ]
  }
}
```

> `ios-simulator` must match the server name you used in your `mcpServers` config. Create the file if it doesn't exist yet.

**Scoped to one project only?** Put the same file at `.claude/settings.json` inside your project root instead.

## Quick Agent Workflow

```text
1) get_screen_summary()
2) find_elements("Sign In")
3) tap_text("Email")
4) type_text("user@example.com")
5) tap_text("Password")
6) type_text("••••••••")
7) tap_text("Sign In")
8) get_screen_summary()
```

This keeps actions grounded in visible state, not assumptions.

## Local Development

```bash
npm run build
npm start
```

Main implementation lives in:
- `src/index.ts`

## Reliability Notes

- If `udid` is omitted, tools default to the currently booted simulator.
- `tap_text` and `find_elements` rely on accessibility labels/values/hints.
- Better accessibility metadata in your app means better AI performance.
- If no simulator is booted, the server returns a clear MCP error.

## Troubleshooting

- `No iOS simulator is currently running`: boot one via Simulator or call `boot_simulator`.
- `idb` command failures: verify `idb`/`idb-companion` installation and PATH.
- Empty or weak element matches: improve app accessibility labels/semantics.

## License

MIT
