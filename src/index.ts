#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';

const execAsync = promisify(exec);

interface SimulatorDevice {
  udid: string;
  name: string;
  state: string;
  isAvailable: boolean;
}

interface UIElement {
  type: string;
  label?: string | null;
  value?: string | null;
  hint?: string | null;
  frame: { x: number; y: number; w: number; h: number };
  enabled?: boolean;
}

async function getBootedUdid(): Promise<string> {
  const { stdout } = await execAsync('xcrun simctl list devices --json');
  const data = JSON.parse(stdout) as { devices: Record<string, SimulatorDevice[]> };

  for (const devices of Object.values(data.devices)) {
    for (const device of devices) {
      if (device.state === 'Booted') {
        return device.udid;
      }
    }
  }

  throw new McpError(
    ErrorCode.InvalidRequest,
    'No iOS simulator is currently running. Use boot_simulator to start one.'
  );
}

async function resolveUdid(udid?: string): Promise<string> {
  return udid ?? getBootedUdid();
}

// idb ui describe-all returns a flat array of elements (no nesting)
function normalizeElement(node: any): UIElement {
  const frame = node.frame ?? {};
  return {
    type: node.type ?? node.AXType ?? 'Unknown',
    label: node.AXLabel ?? node.label ?? null,
    value: node.AXValue ?? node.value ?? null,
    hint: node.help ?? node.AXHint ?? null,
    frame: {
      x: frame.x ?? 0,
      y: frame.y ?? 0,
      w: frame.width ?? 0,
      h: frame.height ?? 0,
    },
    enabled: node.enabled ?? true,
  };
}

function findElementsByText(elements: UIElement[], query: string): UIElement[] {
  const lower = query.toLowerCase();
  return elements.filter(el => {
    const text = [el.label, el.value, el.hint].filter(Boolean).join(' ').toLowerCase();
    return text.includes(lower);
  });
}

class IOSSimulatorMCP {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: 'app-screen-mcp', version: '2.0.0' },
      { capabilities: { tools: {} } }
    );
    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // ── Device management ──────────────────────────────────────────────
        {
          name: 'list_simulators',
          description: 'List all available iOS simulators with their state (Booted, Shutdown, etc.)',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        },
        {
          name: 'boot_simulator',
          description: 'Boot an iOS simulator by UDID',
          inputSchema: {
            type: 'object',
            properties: {
              udid: { type: 'string', description: 'Simulator UDID to boot' },
            },
            required: ['udid'],
            additionalProperties: false,
          },
        },
        {
          name: 'launch_app',
          description: 'Launch an app on a simulator',
          inputSchema: {
            type: 'object',
            properties: {
              bundle_id: { type: 'string', description: 'App bundle identifier (e.g. com.example.myapp)' },
              udid: { type: 'string', description: 'Simulator UDID (optional, defaults to booted simulator)' },
            },
            required: ['bundle_id'],
            additionalProperties: false,
          },
        },
        // ── Perception ─────────────────────────────────────────────────────
        {
          name: 'get_ui_tree',
          description: 'Get the full accessibility/UI tree of the current screen as structured JSON. Prefer this over screenshot for understanding what is on screen.',
          inputSchema: {
            type: 'object',
            properties: {
              udid: { type: 'string', description: 'Simulator UDID (optional, defaults to booted simulator)' },
            },
            additionalProperties: false,
          },
        },
        {
          name: 'take_screenshot',
          description: 'Take a screenshot of the iOS Simulator. Returns a base64-encoded JPEG image.',
          inputSchema: {
            type: 'object',
            properties: {
              udid: { type: 'string', description: 'Simulator UDID (optional, defaults to booted simulator)' },
            },
            additionalProperties: false,
          },
        },
        {
          name: 'get_screen_summary',
          description: 'Get an AI-optimized summary of the current screen: UI accessibility tree + screenshot combined into one payload. Best tool for understanding screen state before acting.',
          inputSchema: {
            type: 'object',
            properties: {
              udid: { type: 'string', description: 'Simulator UDID (optional, defaults to booted simulator)' },
            },
            additionalProperties: false,
          },
        },
        // ── Interaction ────────────────────────────────────────────────────
        {
          name: 'tap',
          description: 'Tap at specific (x, y) coordinates on the simulator screen',
          inputSchema: {
            type: 'object',
            properties: {
              x: { type: 'number', description: 'X coordinate in points' },
              y: { type: 'number', description: 'Y coordinate in points' },
              udid: { type: 'string', description: 'Simulator UDID (optional, defaults to booted simulator)' },
            },
            required: ['x', 'y'],
            additionalProperties: false,
          },
        },
        {
          name: 'type_text',
          description: 'Type text into the currently focused element on the simulator',
          inputSchema: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Text to type' },
              udid: { type: 'string', description: 'Simulator UDID (optional, defaults to booted simulator)' },
            },
            required: ['text'],
            additionalProperties: false,
          },
        },
        {
          name: 'swipe',
          description: 'Perform a swipe gesture from one coordinate to another',
          inputSchema: {
            type: 'object',
            properties: {
              from_x: { type: 'number', description: 'Start X coordinate in points' },
              from_y: { type: 'number', description: 'Start Y coordinate in points' },
              to_x: { type: 'number', description: 'End X coordinate in points' },
              to_y: { type: 'number', description: 'End Y coordinate in points' },
              duration_ms: { type: 'number', description: 'Swipe duration in milliseconds (default: 500)' },
              udid: { type: 'string', description: 'Simulator UDID (optional, defaults to booted simulator)' },
            },
            required: ['from_x', 'from_y', 'to_x', 'to_y'],
            additionalProperties: false,
          },
        },
        {
          name: 'press_button',
          description: 'Press a hardware button on the simulator',
          inputSchema: {
            type: 'object',
            properties: {
              button: {
                type: 'string',
                enum: ['HOME', 'LOCK', 'SIDE_BUTTON', 'SIRI'],
                description: 'Button to press',
              },
              udid: { type: 'string', description: 'Simulator UDID (optional, defaults to booted simulator)' },
            },
            required: ['button'],
            additionalProperties: false,
          },
        },
        // ── AI utilities ───────────────────────────────────────────────────
        {
          name: 'find_elements',
          description: 'Search the UI tree for elements whose label, value, or hint contains the query string',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Text to search for in element labels/values/hints' },
              udid: { type: 'string', description: 'Simulator UDID (optional, defaults to booted simulator)' },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
        {
          name: 'tap_text',
          description: 'Find a UI element by its visible text/label and tap its center. More reliable than coordinate tapping when accessibility labels are present.',
          inputSchema: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Visible text/label of the element to tap' },
              udid: { type: 'string', description: 'Simulator UDID (optional, defaults to booted simulator)' },
            },
            required: ['text'],
            additionalProperties: false,
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const args = (request.params.arguments ?? {}) as Record<string, any>;
      switch (request.params.name) {
        case 'list_simulators':  return this.listSimulators();
        case 'boot_simulator':   return this.bootSimulator(args.udid as string);
        case 'launch_app':       return this.launchApp(args.bundle_id as string, args.udid);
        case 'get_ui_tree':      return this.getUiTree(args.udid);
        case 'take_screenshot':  return this.takeScreenshot(args.udid);
        case 'get_screen_summary': return this.getScreenSummary(args.udid);
        case 'tap':              return this.tap(args.x as number, args.y as number, args.udid);
        case 'type_text':        return this.typeText(args.text as string, args.udid);
        case 'swipe':            return this.swipe(args.from_x, args.from_y, args.to_x, args.to_y, args.duration_ms, args.udid);
        case 'press_button':     return this.pressButton(args.button as string, args.udid);
        case 'find_elements':    return this.findElements(args.query as string, args.udid);
        case 'tap_text':         return this.tapText(args.text as string, args.udid);
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
      }
    });
  }

  // ── Device management ────────────────────────────────────────────────────

  private async listSimulators() {
    try {
      const { stdout } = await execAsync('xcrun simctl list devices --json');
      const data = JSON.parse(stdout) as { devices: Record<string, SimulatorDevice[]> };

      const simulators: Array<{ runtime: string } & SimulatorDevice> = [];
      for (const [runtime, devices] of Object.entries(data.devices)) {
        for (const device of devices) {
          if (device.isAvailable) {
            simulators.push({
              runtime: runtime.replace('com.apple.CoreSimulator.SimRuntime.', ''),
              udid: device.udid,
              name: device.name,
              state: device.state,
              isAvailable: device.isAvailable,
            });
          }
        }
      }

      const booted = simulators.filter(s => s.state === 'Booted');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ booted: booted.length, simulators }, null, 2),
        }],
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to list simulators: ${error.message}`);
    }
  }

  private async bootSimulator(udid: string) {
    try {
      await execAsync(`xcrun simctl boot ${udid}`);
    } catch (error: any) {
      // "Unable to boot device in current state: Booted" is not a failure
      if (!error.stderr?.includes('current state: Booted')) {
        throw new McpError(ErrorCode.InternalError, `Failed to boot simulator: ${error.message}`);
      }
    }
    return {
      content: [{ type: 'text', text: `Simulator ${udid} is booted.` }],
    };
  }

  private async launchApp(bundleId: string, udid?: string) {
    const target = await resolveUdid(udid);
    try {
      const { stdout } = await execAsync(`xcrun simctl launch ${target} ${bundleId}`);
      return {
        content: [{ type: 'text', text: `Launched ${bundleId} on ${target}. ${stdout.trim()}` }],
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to launch app: ${error.message}`);
    }
  }

  // ── Perception ───────────────────────────────────────────────────────────

  private async getUiTree(udid?: string) {
    const target = await resolveUdid(udid);
    try {
      const tree = await this.fetchUiTree(target);
      return {
        content: [{ type: 'text', text: JSON.stringify(tree, null, 2) }],
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to get UI tree: ${error.message}`);
    }
  }

  private async takeScreenshot(udid?: string) {
    const target = await resolveUdid(udid);
    try {
      const base64 = await this.captureScreenshot(target);
      return {
        content: [{ type: 'image', data: base64, mimeType: 'image/jpeg' }],
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to take screenshot: ${error.message}`);
    }
  }

  private async getScreenSummary(udid?: string) {
    const target = await resolveUdid(udid);

    const [treeResult, screenshotResult] = await Promise.allSettled([
      this.fetchUiTree(target),
      this.captureScreenshot(target),
    ]);

    const meta: Record<string, any> = { timestamp: Date.now(), udid: target };
    if (treeResult.status === 'fulfilled') {
      meta.elements = treeResult.value;
      meta.element_count = treeResult.value.length;
    } else {
      meta.ui_tree_error = String(treeResult.reason?.message ?? treeResult.reason);
    }

    const content: any[] = [{ type: 'text', text: JSON.stringify(meta, null, 2) }];

    if (screenshotResult.status === 'fulfilled') {
      content.push({ type: 'image', data: screenshotResult.value, mimeType: 'image/jpeg' });
    }

    return { content };
  }

  // ── Interaction ──────────────────────────────────────────────────────────

  private async tap(x: number, y: number, udid?: string) {
    const target = await resolveUdid(udid);
    try {
      await execAsync(`idb ui tap --udid ${target} ${x} ${y}`);
      return {
        content: [{ type: 'text', text: `Tapped (${x}, ${y}) on ${target}` }],
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to tap: ${error.message}`);
    }
  }

  private async typeText(text: string, udid?: string) {
    const target = await resolveUdid(udid);
    try {
      // Single-quote wrap with inner single-quote escaping prevents shell injection
      const safe = text.replace(/'/g, "'\\''");
      await execAsync(`idb ui text --udid ${target} '${safe}'`);
      return {
        content: [{ type: 'text', text: `Typed "${text}" on ${target}` }],
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to type text: ${error.message}`);
    }
  }

  private async swipe(fromX: number, fromY: number, toX: number, toY: number, durationMs?: number, udid?: string) {
    const target = await resolveUdid(udid);
    const durationSec = ((durationMs ?? 500) / 1000).toFixed(3);
    try {
      await execAsync(`idb ui swipe --udid ${target} ${fromX} ${fromY} ${toX} ${toY} --duration ${durationSec}`);
      return {
        content: [{ type: 'text', text: `Swiped (${fromX},${fromY}) → (${toX},${toY}) over ${durationMs ?? 500}ms on ${target}` }],
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to swipe: ${error.message}`);
    }
  }

  private async pressButton(button: string, udid?: string) {
    const target = await resolveUdid(udid);
    try {
      await execAsync(`idb ui button --udid ${target} ${button}`);
      return {
        content: [{ type: 'text', text: `Pressed ${button} on ${target}` }],
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to press button: ${error.message}`);
    }
  }

  // ── AI utilities ─────────────────────────────────────────────────────────

  private async findElements(query: string, udid?: string) {
    const target = await resolveUdid(udid);
    try {
      const all = await this.fetchUiTree(target);
      const matches = findElementsByText(all, query);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ query, count: matches.length, elements: matches }, null, 2),
        }],
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to find elements: ${error.message}`);
    }
  }

  private async tapText(text: string, udid?: string) {
    const target = await resolveUdid(udid);
    try {
      const elements = await this.fetchUiTree(target);
      const matches = findElementsByText(elements, text);

      if (matches.length === 0) {
        throw new McpError(ErrorCode.InvalidRequest, `No element found with text matching "${text}"`);
      }

      const el = matches[0];
      const cx = Math.round(el.frame.x + el.frame.w / 2);
      const cy = Math.round(el.frame.y + el.frame.h / 2);

      await execAsync(`idb ui tap --udid ${target} ${cx} ${cy}`);

      return {
        content: [{
          type: 'text',
          text: `Tapped element "${el.label ?? el.value ?? text}" at center (${cx}, ${cy}) on ${target}`,
        }],
      };
    } catch (error: any) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to tap text: ${error.message}`);
    }
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  // idb ui describe-all returns a flat JSON array of elements
  private async fetchUiTree(udid: string): Promise<UIElement[]> {
    const { stdout } = await execAsync(`idb ui describe-all --udid ${udid}`);
    const raw: any[] = JSON.parse(stdout);
    return Array.isArray(raw) ? raw.map(normalizeElement) : [normalizeElement(raw)];
  }

  private async captureScreenshot(udid: string): Promise<string> {
    const jpg = `/tmp/ios_sim_${Date.now()}.jpg`;
    try {
      // simctl infers JPEG format from the .jpg extension — no intermediate PNG needed
      await execAsync(`xcrun simctl io ${udid} screenshot "${jpg}"`);
      const buf = await readFile(jpg);
      return buf.toString('base64');
    } finally {
      execAsync(`rm -f "${jpg}"`).catch(() => {});
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('App Screen MCP Server running on stdio');
  }
}

const server = new IOSSimulatorMCP();
server.run().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
