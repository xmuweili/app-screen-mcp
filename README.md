<div align="center">
  <img src="assets/banner.svg" alt="app-screen-mcp banner" width="100%"/>

  <br/>
  <br/>

  [![License: MIT](https://img.shields.io/badge/License-MIT-7c3aed.svg?style=flat-square)](LICENSE)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-06b6d4.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![MCP](https://img.shields.io/badge/MCP-Compatible-a78bfa.svg?style=flat-square)](https://modelcontextprotocol.io)
  [![Platform](https://img.shields.io/badge/Platform-macOS-34d399.svg?style=flat-square&logo=apple&logoColor=white)]()

  **Give AI agents eyes and hands on your iOS Simulator.**
  A [Model Context Protocol](https://modelcontextprotocol.io) server that lets any AI assistant perceive and interact with iOS apps — through the accessibility tree, screenshots, taps, swipes, and more.

</div>

---

## What is this?

`app-screen-mcp` is an MCP server that bridges your AI assistant (Claude, Cursor, etc.) to a running iOS Simulator. It exposes a clean set of tools so the AI can:

- **See** what's on screen — via the structured accessibility tree or a screenshot
- **Act** on the UI — tap elements, type text, swipe, press hardware buttons
- **Reason** intelligently — find elements by their visible text, get a combined AI-ready screen summary

No brittle CSS selectors. No OCR. The accessibility tree gives the AI structured, semantic information about every element on screen — labels, types, positions, states — the same data a screen reader uses.

```
AI Agent ──► MCP Client ──► app-screen-mcp ──► idb / xcrun simctl ──► iOS Simulator
                                                    ▲
                                         Accessibility Tree + Screenshot
```

---

## Features

| Capability | How |
|---|---|
| 📐 **Structured screen perception** | Reads the iOS accessibility tree via `idb ui describe-all` — types, labels, frames |
| 📸 **Screenshot** | Captures and returns a JPEG screenshot as base64 |
| 🎯 **Tap by text** | Finds an element by its visible label and taps its center — no coordinates needed |
| ⌨️ **Type text** | Types into the focused element with shell-injection-safe escaping |
| 👆 **Coordinate tap** | Tap at any (x, y) point as a fallback |
| 🔄 **Swipe** | Full swipe gesture with start/end coords and duration |
| 🔘 **Hardware buttons** | Simulate HOME, LOCK, SIRI, SIDE_BUTTON |
| 🔍 **Element search** | Query the UI tree by text and get back matching elements with their frames |
| 🤖 **AI screen summary** | Combined tree + screenshot in a single call — the best tool for understanding screen state |
| 📱 **Device management** | List simulators, boot a simulator, launch an app |

---

## Prerequisites

- **macOS** (Xcode must be installed)
- **Node.js** 18+
- **idb** — Facebook's iOS Device Bridge

```bash
brew tap facebook/fb
brew install idb-companion
pip3 install fb-idb
```

- An **iOS Simulator** running (open via Xcode → Window → Devices and Simulators, or Simulator.app)

---

## Installation

```bash
git clone https://github.com/xmuweili/app-screen-mcp.git
cd app-screen-mcp
npm install
npm run build
```

---

## Connecting to your AI client

### Claude Desktop

Add this to your `claude_desktop_config.json` (usually at `~/Library/Application Support/Claude/`):

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

### Cursor / VS Code (via MCP extension)

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

Restart your client after saving. The tools will appear automatically.

---

## Tool Reference

### Device Management

#### `list_simulators`
Lists all available iOS simulators and their current state.
```json
{}
```
Returns a JSON list of simulators with `udid`, `name`, `state`, and `runtime`.

---

#### `boot_simulator`
Boots a simulator by UDID.
```json
{ "udid": "2FCF6F16-0857-4CB1-B2DC-9A69F2C8231C" }
```

---

#### `launch_app`
Launches an installed app on the simulator.
```json
{ "bundle_id": "com.example.MyApp", "udid": "..." }
```
`udid` is optional — defaults to the currently booted simulator.

---

### Perceiving the Screen

#### `get_ui_tree` ⭐
Returns the full accessibility tree of the current screen as structured JSON.
Each element includes its **type**, **label**, **value**, **frame** (x, y, w, h), and **enabled** state.

```json
{ "udid": "..." }
```

Example output element:
```json
{
  "type": "Button",
  "label": "Generate",
  "value": null,
  "frame": { "x": 44, "y": 846, "w": 352, "h": 60 },
  "enabled": true
}
```

---

#### `take_screenshot`
Takes a screenshot and returns it as a base64-encoded JPEG image.

```json
{ "udid": "..." }
```

---

#### `get_screen_summary` ⭐
The best tool for AI agents to understand the current screen state. Fetches the accessibility tree and screenshot **in parallel** and returns both in a single response.

```json
{ "udid": "..." }
```

Returns:
```json
{
  "timestamp": 1714000000000,
  "udid": "2FCF6F16-...",
  "element_count": 27,
  "elements": [ ... ]
}
```
…followed by the screenshot image in the same response.

---

### Interacting with the Screen

#### `tap_text` ⭐
Finds the first element whose label/value/hint contains the given text, then taps its center. More reliable than coordinate tapping.

```json
{ "text": "Generate", "udid": "..." }
```

---

#### `tap`
Taps at a specific coordinate.

```json
{ "x": 220, "y": 876, "udid": "..." }
```

---

#### `type_text`
Types text into the currently focused element.

```json
{ "text": "white wall, wooden floor", "udid": "..." }
```

---

#### `swipe`
Performs a swipe gesture between two points.

```json
{
  "from_x": 200, "from_y": 700,
  "to_x": 200,   "to_y": 200,
  "duration_ms": 400,
  "udid": "..."
}
```

---

#### `press_button`
Simulates a hardware button press.

```json
{ "button": "HOME", "udid": "..." }
```

`button` options: `HOME` · `LOCK` · `SIDE_BUTTON` · `SIRI`

---

### AI Utilities

#### `find_elements`
Searches the current UI tree for elements matching a text query (searches labels, values, and hints).

```json
{ "query": "Login", "udid": "..." }
```

Returns:
```json
{
  "query": "Login",
  "count": 2,
  "elements": [ ... ]
}
```

---

## Example: AI-driven flow

Here's what an AI agent can do with this server in a single conversation turn:

```
1. get_screen_summary()       → sees the current screen
2. find_elements("Sign In")   → locates the login button
3. tap_text("Email")          → taps the email field
4. type_text("user@example.com")
5. tap_text("Password")
6. type_text("hunter2")
7. tap_text("Sign In")
8. get_screen_summary()       → confirms navigation succeeded
```

No hardcoded coordinates. No flaky selectors. Just semantic interaction driven by what's actually visible on screen.

---

## Tips for better results

- **Add `Semantics` to Flutter apps** — if your app is built in Flutter, wrap key widgets with `Semantics(label: "...")` to populate the accessibility tree. Without it, the AI falls back to coordinate tapping.
- **Use `tap_text` over `tap`** whenever the element has a visible label.
- **Use `get_screen_summary`** at the start of each task to give the AI full context before it acts.
- **Use `find_elements`** to verify an element exists before tapping it.

---

## Architecture

```
src/
└── index.ts          Single-file MCP server

External dependencies:
  xcrun simctl        Device lifecycle, screenshots
  idb                 UI tree, tap, swipe, type, button press
```

The server is intentionally a thin adapter — it validates inputs, shells out to `idb` / `simctl`, normalizes outputs into a consistent JSON schema, and returns them as MCP tool responses.

---

## License

MIT © [xmuweili](https://github.com/xmuweili)
