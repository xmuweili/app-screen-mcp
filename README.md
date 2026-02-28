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

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/xmuweili/app-screen-mcp/main/install.sh)
```

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

### How the AI discovers and runs it

You never invoke the server manually. Here is what happens automatically:

```text
1. You add the server to your MCP client config (one-time setup)

2. MCP client starts  →  spawns  node dist/index.js  as a child process

3. Client sends tools/list  →  server returns all 13 tool definitions
   (name, description, JSON input schema for each tool)

4. Client injects those definitions into the AI's context on every turn

5. AI reads the tool list and calls tools on its own when relevant
   e.g. "take a screenshot" → AI calls take_screenshot, gets back JPEG
        "tap the Login button" → AI calls tap_text({text:"Login"})

6. Client relays the call to the server process via stdio,
   server runs xcrun / idb commands, returns the result to the AI
```

The AI does not need to be told the server exists — the tool descriptions
are always present in its context. As long as the task involves an iOS
Simulator, the AI will reach for the right tool automatically.

## Feature Highlights

- Full simulator discovery and boot control
- App launch by bundle ID
- Accessibility-first perception via normalized UI elements
- Screenshot capture with resize and JPEG quality controls
- Hash-based unchanged-image suppression to save tokens
- `tap_text` for semantic interaction by visible label
- `tap_relative` for resolution-independent tapping (for example `0.5, 0.5` = center)
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
| `take_screenshot` | Return JPEG image with `max_dim`, `quality`, and unchanged-image suppression |
| `get_screen_summary` | Return UI tree plus optional screenshot (`include_image`, `compact_tree`, image hash metadata) |
| `tap` | Tap exact `(x, y)` coordinates |
| `tap_relative` | Tap relative `(rx, ry)` in `[0,1]` (`0.5, 0.5` is center) |
| `type_text` | Type into currently focused field |
| `swipe` | Swipe between two points with optional duration |
| `press_button` | Press `HOME`, `LOCK`, `SIDE_BUTTON`, or `SIRI` |
| `find_elements` | Search UI elements by label/value/hint text |
| `tap_text` | Find first matching element by text and tap its center |

## Token-Efficient Usage

Start with tree-only context, then request an image only when needed:

```json
{
  "name": "get_screen_summary",
  "arguments": {
    "include_image": false,
    "compact_tree": true
  }
}
```

When image is needed, compress it:

```json
{
  "name": "get_screen_summary",
  "arguments": {
    "include_image": true,
    "max_dim": 720,
    "quality": 55
  }
}
```

Skip resending unchanged screenshots:

```json
{
  "name": "get_screen_summary",
  "arguments": {
    "include_image": true,
    "only_if_changed": true,
    "previous_image_hash": "<last_hash>"
  }
}
```

Use relative taps when acting from image coordinates:

```json
{
  "name": "tap_relative",
  "arguments": {
    "rx": 0.5,
    "ry": 0.5
  }
}
```

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

### One-stop script (recommended)

Downloads and installs all prerequisites (Homebrew, Node.js, idb-companion, fb-idb) and then
installs `app-screen-mcp` globally:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/xmuweili/app-screen-mcp/main/install.sh)
```

### npm / pnpm (global)

```bash
npm install -g app-screen-mcp
# or
pnpm add -g app-screen-mcp
```

The installed binary path is printed by the one-stop script; you can also find it with:

```bash
node -e "console.log(require('path').join(require('child_process').execSync('npm root -g').toString().trim(),'app-screen-mcp','dist','index.js'))"
```

### From source

```bash
git clone https://github.com/xmuweili/app-screen-mcp.git
cd app-screen-mcp
npm install
npm run build
# binary → dist/index.js
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

## Avoid Repeated Permission Prompts

Prompt behavior is controlled by the MCP client, not this server.

Most GUI MCP clients (Claude Desktop, Cursor, Windsurf, Zed, Continue.dev) usually treat adding the server to config as trust grant, so you should not see repeated tool approvals.

### Claude Code (CLI)

Allow this server's tools in `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "mcp__ios-simulator__*"
    ]
  }
}
```

`ios-simulator` must match the server name in your MCP config.

Use `.claude/settings.json` in project root if you want this scoped per-repo.

### Codex CLI

Codex uses command-level approval. To avoid repeated prompts:

- Approve once with "always allow" when Codex asks.
- Save reusable prefix rules for common commands.
- Typical prefix: `["xcrun", "simctl", "list", "devices", "--json"]`
- Typical prefix: `["idb", "list-targets"]`
- Typical prefix: `["idb", "list-apps", "--udid", "<SIMULATOR_UDID>"]`

Codex may still prompt for new or higher-risk command patterns.

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

## Contributing

Contributions are welcome. Here is the full development workflow.

### 1. Fork and clone

```bash
git clone https://github.com/<your-username>/app-screen-mcp.git
cd app-screen-mcp
npm install
```

### 2. Build

```bash
npm run build        # compiles src/index.ts → dist/
```

TypeScript source is in `src/index.ts`. The compiled output is what gets published to npm
(the `dist/` directory is git-ignored but included in the npm tarball via `"files"`).

### 3. Run tests

The test suite drives a real iOS Simulator through the MCP server. Before running:

1. Open Xcode → Simulator and boot a device (iPhone 16 Pro or similar).
2. Build and install the demo app:
   ```bash
   cd demo-app
   xcodebuild -project MCPDemo.xcodeproj -scheme MCPDemo \
     -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build
   # Install the built .app onto the booted simulator
   xcrun simctl install booted \
     $(xcodebuild -project MCPDemo.xcodeproj -scheme MCPDemo \
       -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
       -showBuildSettings 2>/dev/null | awk '/BUILT_PRODUCTS_DIR/{print $3}')/MCPDemo.app
   ```
3. Return to repo root and run:
   ```bash
   npm test
   ```

Tests use Node.js built-in `node:test` with TypeScript executed via `tsx`. Each test
communicates with `dist/index.js` through a `StdioClientTransport` — the full MCP stack
is exercised on every run.

Test helpers live in `tests/helpers/`:

| File | Purpose |
|---|---|
| `client.ts` | Spawns the MCP server, exposes `callTool` |
| `ui.ts` | Typed wrappers: `tapId`, `typeText`, `swipe`, `assertValue`, … |
| `vision.ts` | Screenshot helpers: `screenshotHash`, `saveScreenshot`, `getScreenSummary`, `tapRelativeById` |

### 4. Add a new tool

All tools are registered in a single file: `src/index.ts`.

1. Add your tool's schema inside the `ListToolsRequestSchema` handler.
2. Add the tool's implementation inside the `CallToolRequestSchema` handler (follow the
   existing `case` pattern).
3. Add a `UIElement` field if the new tool needs to surface new accessibility data.
4. Write at least one test in `tests/demo-app.test.ts`.
5. Run `npm test` to verify everything passes.
6. Update the **Tool Catalog** table in `README.md`.

### 5. Submit a pull request

- Keep commits focused (one logical change per commit).
- Include a short description of *why* the change is needed, not just *what* changed.
- If your PR adds or changes a tool, update the Tool Catalog table and run `npm test`.
- CI is not yet configured — maintainer will run tests before merge.

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
