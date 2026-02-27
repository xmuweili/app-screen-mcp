# App Screen MCP

An MCP (Model Context Protocol) server that enables AI agents to visually interact with mobile app screens. This server allows AI assistants to take screenshots, inspect UI hierarchies, interact with elements, and analyze app interfaces.

## Features

- **take_screenshot** - Captures screenshots from the iOS Simulator and returns them as base64-encoded images that AI can see visually
- **dump_layout_tree** - Dumps the UI accessibility hierarchy for understanding app structure
- **list_simulators** - Shows all available iOS simulators on the system

## Prerequisites

- macOS with Xcode installed
- Node.js 18+
- iOS Simulator (part of Xcode)

## Installation

### Option 1: Install from source

```bash
# Clone or download this repository
cd ios-simulator-mcp

# Install dependencies
npm install

# Build the TypeScript code
npm run build

# Test the server
npm start
```

### Option 2: Global installation

```bash
# Install globally for easy access
npm install -g .

# Run from anywhere
ios-simulator-mcp
```

## Usage

### Running the Server

```bash
# Development mode (rebuilds on changes)
npm run dev

# Production mode
npm start

# Or if installed globally
ios-simulator-mcp
```

### Testing the Tools

Before connecting to AI tools, make sure you have an iOS Simulator running:

1. Open Xcode
2. Go to Xcode → Open Developer Tool → Simulator
3. Launch any iOS device simulator

## Integration with AI Coding Tools

### Cursor IDE

Add this to your Cursor settings in `~/Library/Application Support/Cursor/User/globalStorage/cursor.settings.json`:

```json
{
  "mcp": {
    "servers": {
      "ios-simulator": {
        "command": "node",
        "args": ["/path/to/ios-simulator-mcp/dist/index.js"]
      }
    }
  }
}
```

Or if installed globally:

```json
{
  "mcp": {
    "servers": {
      "ios-simulator": {
        "command": "ios-simulator-mcp"
      }
    }
  }
}
```

### Claude Code

Add this to your `~/.config/claude-code/mcp.json`:

```json
{
  "servers": {
    "ios-simulator": {
      "command": "node",
      "args": ["/path/to/ios-simulator-mcp/dist/index.js"]
    }
  }
}
```

Or if installed globally:

```json
{
  "servers": {
    "ios-simulator": {
      "command": "ios-simulator-mcp"
    }
  }
}
```

### Other MCP-compatible tools

This server implements the standard MCP protocol and should work with any MCP-compatible AI tool. Use the command `node /path/to/dist/index.js` or `ios-simulator-mcp` if installed globally.

## Available Tools

### take_screenshot

Takes a screenshot of the currently running iOS Simulator.

**Usage:** Ask your AI assistant to "take a screenshot of the iOS simulator"

**Returns:** Base64-encoded PNG image that AI can see and analyze visually

### dump_layout_tree

Dumps the accessibility hierarchy of the current iOS Simulator screen.

**Usage:** Ask your AI assistant to "show me the UI hierarchy" or "dump the layout tree"

**Returns:** Text representation of the UI element tree with accessibility information

### list_simulators

Lists all available iOS simulators on your system.

**Usage:** Ask your AI assistant to "list available simulators"

**Returns:** Text output showing all simulator devices, runtimes, and their states

## Error Handling

The server gracefully handles common error scenarios:

- **No simulator running**: Clear error message asking to start a simulator first
- **Missing Xcode tools**: Error message about missing xcrun command
- **Permission issues**: Helpful error messages about file access

## Troubleshooting

### "No devices are booted"
Make sure you have an iOS Simulator running. Open Xcode → Developer Tools → Simulator and launch a device.

### "xcrun: error: unable to find utility"
Ensure Xcode is installed and command line tools are set up:
```bash
xcode-select --install
```

### "command not found: ios-simulator-mcp"
If installed globally, make sure npm's global bin directory is in your PATH:
```bash
npm config get prefix
```

### Permission errors
Make sure the server has permission to write to `/tmp/` directory for screenshot files.

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development mode
npm run dev
```

## License

MIT