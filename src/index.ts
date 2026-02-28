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
import { createHash } from 'crypto';

const execAsync = promisify(exec);

const DEFAULT_MAX_DIM = 960;
const DEFAULT_JPEG_QUALITY = 60;
const MIN_MAX_DIM = 256;
const MAX_MAX_DIM = 4096;
const MIN_JPEG_QUALITY = 20;
const MAX_JPEG_QUALITY = 95;

interface SimulatorDevice {
  udid: string;
  name: string;
  state: string;
  isAvailable: boolean;
}

interface UIElement {
  type: string;
  identifier?: string | null;
  label?: string | null;
  value?: string | null;
  hint?: string | null;
  frame: { x: number; y: number; w: number; h: number };
  enabled?: boolean;
}

interface ScreenshotOptions {
  maxDim: number;
  quality: number;
}

interface ScreenshotPayload {
  base64: string;
  hash: string;
  sourceWidth: number;
  sourceHeight: number;
  sentWidth: number;
  sentHeight: number;
  maxDim: number;
  quality: number;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(input: unknown): number | undefined {
  if (typeof input !== 'number') return undefined;
  return Number.isFinite(input) ? input : undefined;
}

function normalizeScreenshotOptions(maxDimInput?: unknown, qualityInput?: unknown): ScreenshotOptions {
  const maxDimRaw = toFiniteNumber(maxDimInput);
  const qualityRaw = toFiniteNumber(qualityInput);

  const maxDim = clamp(
    Math.round(maxDimRaw ?? DEFAULT_MAX_DIM),
    MIN_MAX_DIM,
    MAX_MAX_DIM
  );
  const quality = clamp(
    Math.round(qualityRaw ?? DEFAULT_JPEG_QUALITY),
    MIN_JPEG_QUALITY,
    MAX_JPEG_QUALITY
  );

  return { maxDim, quality };
}

// idb ui describe-all returns a flat array of elements (no nesting)
function normalizeElement(node: any): UIElement {
  const frame = node.frame ?? {};
  // idb reports UISwitch as type="CheckBox" with subrole="AXSwitch"; normalise to "Switch"
  const rawType: string = node.type ?? node.AXType ?? 'Unknown';
  const type = (rawType === 'CheckBox' && node.subrole === 'AXSwitch') ? 'Switch' : rawType;
  return {
    type,
    identifier: node.AXUniqueId ?? node.AXIdentifier ?? node.identifier ?? null,
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
  return elements.filter((el) => {
    const text = [el.identifier, el.label, el.value, el.hint].filter(Boolean).join(' ').toLowerCase();
    return text.includes(lower);
  });
}

function findElementsById(elements: UIElement[], id: string): UIElement[] {
  return elements.filter((el) => el.identifier === id);
}

function isInteractiveElement(type: string): boolean {
  return /(button|textfield|secure|switch|cell|link|tab|slider|picker|menu|checkbox|radio)/i.test(type);
}

function normalizeText(value?: string | null): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function frameArea(frame: UIElement['frame']): number {
  return Math.max(0, frame.w) * Math.max(0, frame.h);
}

function getScreenFrame(elements: UIElement[]): UIElement['frame'] {
  const app = elements.find((el) => /application/i.test(el.type) && el.frame.w > 0 && el.frame.h > 0);
  if (app) return app.frame;

  let maxX = 0;
  let maxY = 0;
  for (const el of elements) {
    maxX = Math.max(maxX, el.frame.x + el.frame.w);
    maxY = Math.max(maxY, el.frame.y + el.frame.h);
  }
  return { x: 0, y: 0, w: maxX, h: maxY };
}

function scoreTextMatch(el: UIElement, query: string, screen: UIElement['frame']): number {
  const q = normalizeText(query);
  const label = normalizeText(el.label);
  const value = normalizeText(el.value);
  const hint = normalizeText(el.hint);
  const area = frameArea(el.frame);
  const screenArea = Math.max(1, frameArea(screen));
  const areaRatio = area / screenArea;

  let score = 0;
  if (isInteractiveElement(el.type)) score += 100;

  if (label === q || value === q || hint === q) score += 50;
  if (label.startsWith(q) || value.startsWith(q) || hint.startsWith(q)) score += 25;
  if (label.includes(q) || value.includes(q) || hint.includes(q)) score += 15;

  // Prefer localized elements over full-screen containers for tap targeting.
  if (!isInteractiveElement(el.type) && areaRatio > 0.5) score -= 30;
  if (areaRatio < 0.15) score += 10;

  return score;
}

function pickBestTextMatch(matches: UIElement[], query: string, all: UIElement[]): UIElement {
  const screen = getScreenFrame(all);
  return [...matches].sort((a, b) => {
    const byScore = scoreTextMatch(b, query, screen) - scoreTextMatch(a, query, screen);
    if (byScore !== 0) return byScore;
    const aArea = a.frame.w * a.frame.h;
    const bArea = b.frame.w * b.frame.h;
    return aArea - bArea;
  })[0];
}

function inferTapPointForText(
  el: UIElement,
  query: string,
  screen: UIElement['frame']
): { x: number; y: number; strategy: string } {
  const centerX = Math.round(el.frame.x + el.frame.w / 2);
  const centerY = Math.round(el.frame.y + el.frame.h / 2);

  if (isInteractiveElement(el.type)) {
    return { x: centerX, y: centerY, strategy: 'interactive-center' };
  }

  const screenArea = Math.max(1, frameArea(screen));
  const areaRatio = frameArea(el.frame) / screenArea;
  const label = String(el.label ?? el.value ?? '').trim();
  const lines = label.split('\n').map((line) => line.trim()).filter(Boolean);

  // For full-screen narrative/text containers, estimate tap position by the matching line.
  if (areaRatio > 0.45 && lines.length >= 2) {
    const q = normalizeText(query);
    let index = lines.findIndex((line) => normalizeText(line).includes(q));
    if (index < 0) {
      // Query can be in merged text but not line-normalized; assume CTA is near the bottom.
      index = lines.length - 1;
    }
    let lineRatio = (index + 0.5) / lines.length;
    // CTA labels in hero-style onboarding screens are often visually lower than text-line center.
    if (index === lines.length - 1) {
      lineRatio = Math.max(lineRatio, 0.94);
    }
    const x = Math.round(el.frame.x + el.frame.w * 0.5);
    const y = Math.round(el.frame.y + el.frame.h * lineRatio);
    return { x, y, strategy: 'large-text-line' };
  }

  return { x: centerX, y: centerY, strategy: 'noninteractive-center' };
}

function buildTapPointCandidates(
  el: UIElement,
  primary: { x: number; y: number; strategy: string },
  screen: UIElement['frame']
): Array<{ x: number; y: number; strategy: string }> {
  const candidates = [{ ...primary }];
  const areaRatio = frameArea(el.frame) / Math.max(1, frameArea(screen));

  // Full-screen text containers often hide CTA hit area near the lower edge.
  if (!isInteractiveElement(el.type) && areaRatio > 0.45) {
    const x = Math.round(el.frame.x + el.frame.w * 0.5);
    candidates.push({ x, y: Math.round(el.frame.y + el.frame.h * 0.98), strategy: 'large-text-bottom-98' });
    candidates.push({ x, y: Math.round(el.frame.y + el.frame.h * 0.92), strategy: 'large-text-bottom-92' });
    candidates.push({ x, y: Math.round(el.frame.y + el.frame.h * 0.86), strategy: 'large-text-bottom-86' });
  }

  const seen = new Set<string>();
  return candidates.filter((point) => {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

class IOSSimulatorMCP {
  private server: Server;
  private lastScreenshotHashByUdid: Map<string, string> = new Map();

  constructor() {
    this.server = new Server(
      { name: 'app-screen-mcp', version: '2.1.0' },
      { capabilities: { tools: {} } }
    );
    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Device management
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
          name: 'terminate_app',
          description: 'Terminate (force-quit) an app on a simulator',
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

        // Perception
        {
          name: 'get_ui_tree',
          description: 'Get the full accessibility/UI tree as structured JSON.',
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
          description: 'Take a JPEG screenshot with optional compression and unchanged-image suppression.',
          inputSchema: {
            type: 'object',
            properties: {
              udid: { type: 'string', description: 'Simulator UDID (optional, defaults to booted simulator)' },
              max_dim: { type: 'number', description: 'Max width/height for output image (default: 960)' },
              quality: { type: 'number', description: 'JPEG quality 20..95 (default: 60)' },
              only_if_changed: { type: 'boolean', description: 'Do not return image content if hash is unchanged' },
              previous_image_hash: { type: 'string', description: 'Compare against this hash for unchanged detection' },
            },
            additionalProperties: false,
          },
        },
        {
          name: 'get_screen_summary',
          description: 'Get screen context (UI tree and optional screenshot) with token-saving options.',
          inputSchema: {
            type: 'object',
            properties: {
              udid: { type: 'string', description: 'Simulator UDID (optional, defaults to booted simulator)' },
              include_image: { type: 'boolean', description: 'Include screenshot image content (default: true)' },
              max_dim: { type: 'number', description: 'Max width/height for output image (default: 960)' },
              quality: { type: 'number', description: 'JPEG quality 20..95 (default: 60)' },
              only_if_changed: { type: 'boolean', description: 'Do not return image content if hash is unchanged' },
              previous_image_hash: { type: 'string', description: 'Compare against this hash for unchanged detection' },
              compact_tree: { type: 'boolean', description: 'Return compact tree format for fewer tokens' },
            },
            additionalProperties: false,
          },
        },

        // Interaction
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
          name: 'tap_relative',
          description: 'Tap using relative coordinates (rx, ry) in [0,1] where (0.5, 0.5) is center.',
          inputSchema: {
            type: 'object',
            properties: {
              rx: { type: 'number', description: 'Relative X in [0,1]' },
              ry: { type: 'number', description: 'Relative Y in [0,1]' },
              udid: { type: 'string', description: 'Simulator UDID (optional, defaults to booted simulator)' },
            },
            required: ['rx', 'ry'],
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

        // AI utilities
        {
          name: 'find_elements',
          description: 'Search the UI tree for elements whose label, value, or hint contains query text',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Text to search for in labels/values/hints' },
              udid: { type: 'string', description: 'Simulator UDID (optional, defaults to booted simulator)' },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
        {
          name: 'tap_text',
          description: 'Find a UI element by visible text and tap its center.',
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
        {
          name: 'tap_id',
          description: 'Find a UI element by its accessibility identifier and tap its center.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Accessibility identifier of the element (set via .accessibilityIdentifier in SwiftUI)' },
              udid: { type: 'string', description: 'Simulator UDID (optional, defaults to booted simulator)' },
            },
            required: ['id'],
            additionalProperties: false,
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const args = (request.params.arguments ?? {}) as Record<string, any>;

      switch (request.params.name) {
        case 'list_simulators':
          return this.listSimulators();
        case 'boot_simulator':
          return this.bootSimulator(args.udid as string);
        case 'terminate_app':
          return this.terminateApp(args.bundle_id as string, args.udid);
        case 'launch_app':
          return this.launchApp(args.bundle_id as string, args.udid);
        case 'get_ui_tree':
          return this.getUiTree(args.udid);
        case 'take_screenshot':
          return this.takeScreenshot(
            args.udid,
            args.max_dim,
            args.quality,
            args.only_if_changed,
            args.previous_image_hash
          );
        case 'get_screen_summary':
          return this.getScreenSummary(
            args.udid,
            args.include_image,
            args.max_dim,
            args.quality,
            args.only_if_changed,
            args.previous_image_hash,
            args.compact_tree
          );
        case 'tap':
          return this.tap(args.x as number, args.y as number, args.udid);
        case 'tap_relative':
          return this.tapRelative(args.rx as number, args.ry as number, args.udid);
        case 'type_text':
          return this.typeText(args.text as string, args.udid);
        case 'swipe':
          return this.swipe(args.from_x, args.from_y, args.to_x, args.to_y, args.duration_ms, args.udid);
        case 'press_button':
          return this.pressButton(args.button as string, args.udid);
        case 'find_elements':
          return this.findElements(args.query as string, args.udid);
        case 'tap_text':
          return this.tapText(args.text as string, args.udid);
        case 'tap_id':
          return this.tapById(args.id as string, args.udid);
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
      }
    });
  }

  // Device management

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

      const booted = simulators.filter((s) => s.state === 'Booted');
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
      if (!error.stderr?.includes('current state: Booted')) {
        throw new McpError(ErrorCode.InternalError, `Failed to boot simulator: ${error.message}`);
      }
    }
    return {
      content: [{ type: 'text', text: `Simulator ${udid} is booted.` }],
    };
  }

  private async terminateApp(bundleId: string, udid?: string) {
    const target = await resolveUdid(udid);
    try {
      await execAsync(`xcrun simctl terminate ${target} ${bundleId}`);
    } catch {
      // Ignore errors — app may not be running
    }
    return {
      content: [{ type: 'text', text: `Terminated ${bundleId} on ${target}` }],
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

  // Perception

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

  private async takeScreenshot(
    udid?: string,
    maxDimInput?: number,
    qualityInput?: number,
    onlyIfChanged?: boolean,
    previousImageHash?: string
  ) {
    const target = await resolveUdid(udid);
    const options = normalizeScreenshotOptions(maxDimInput, qualityInput);

    try {
      const shot = await this.captureScreenshot(target, options);

      const compareHash = previousImageHash ?? (
        onlyIfChanged ? this.lastScreenshotHashByUdid.get(target) : undefined
      );
      const changed = compareHash ? compareHash !== shot.hash : true;

      this.lastScreenshotHashByUdid.set(target, shot.hash);

      const meta = {
        udid: target,
        hash: shot.hash,
        previous_hash: compareHash ?? null,
        changed,
        included: changed,
        source_width: shot.sourceWidth,
        source_height: shot.sourceHeight,
        sent_width: shot.sentWidth,
        sent_height: shot.sentHeight,
        max_dim: shot.maxDim,
        quality: shot.quality,
      };

      const content: any[] = [{ type: 'text', text: JSON.stringify(meta, null, 2) }];
      if (changed) {
        content.push({ type: 'image', data: shot.base64, mimeType: 'image/jpeg' });
      }

      return { content };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to take screenshot: ${error.message}`);
    }
  }

  private async getScreenSummary(
    udid?: string,
    includeImage?: boolean,
    maxDimInput?: number,
    qualityInput?: number,
    onlyIfChanged?: boolean,
    previousImageHash?: string,
    compactTree?: boolean
  ) {
    const target = await resolveUdid(udid);
    const shouldIncludeImage = includeImage !== false;
    const options = normalizeScreenshotOptions(maxDimInput, qualityInput);

    const promises: Promise<any>[] = [this.fetchUiTree(target)];
    if (shouldIncludeImage) {
      promises.push(this.captureScreenshot(target, options));
    }

    const settled = await Promise.allSettled(promises);
    const treeResult = settled[0];
    const screenshotResult = shouldIncludeImage ? settled[1] : undefined;

    const meta: Record<string, any> = {
      timestamp: Date.now(),
      udid: target,
      include_image: shouldIncludeImage,
      compact_tree: compactTree === true,
    };

    if (treeResult.status === 'fulfilled') {
      const elements = treeResult.value as UIElement[];
      meta.element_count = elements.length;
      meta.elements = compactTree === true ? this.compactElements(elements) : elements;
    } else {
      meta.ui_tree_error = String(treeResult.reason?.message ?? treeResult.reason);
    }

    const content: any[] = [{ type: 'text', text: JSON.stringify(meta, null, 2) }];

    if (shouldIncludeImage && screenshotResult) {
      if (screenshotResult.status === 'fulfilled') {
        const shot = screenshotResult.value as ScreenshotPayload;
        const compareHash = previousImageHash ?? (
          onlyIfChanged ? this.lastScreenshotHashByUdid.get(target) : undefined
        );
        const changed = compareHash ? compareHash !== shot.hash : true;

        this.lastScreenshotHashByUdid.set(target, shot.hash);

        meta.image = {
          hash: shot.hash,
          previous_hash: compareHash ?? null,
          changed,
          included: changed,
          source_width: shot.sourceWidth,
          source_height: shot.sourceHeight,
          sent_width: shot.sentWidth,
          sent_height: shot.sentHeight,
          max_dim: shot.maxDim,
          quality: shot.quality,
        };

        content[0] = { type: 'text', text: JSON.stringify(meta, null, 2) };
        if (changed) {
          content.push({ type: 'image', data: shot.base64, mimeType: 'image/jpeg' });
        }
      } else {
        meta.image_error = String(screenshotResult.reason?.message ?? screenshotResult.reason);
        content[0] = { type: 'text', text: JSON.stringify(meta, null, 2) };
      }
    }

    return { content };
  }

  // Interaction

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

  private async tapRelative(rx: number, ry: number, udid?: string) {
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx < 0 || rx > 1 || ry < 0 || ry > 1) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'rx and ry must be finite numbers between 0 and 1.'
      );
    }

    const target = await resolveUdid(udid);
    try {
      const size = await this.getScreenSize(target);
      const x = Math.round(size.width * rx);
      const y = Math.round(size.height * ry);

      await execAsync(`idb ui tap --udid ${target} ${x} ${y}`);
      return {
        content: [{
          type: 'text',
          text: `Tapped relative (${rx}, ${ry}) -> absolute (${x}, ${y}) on ${target} (screen ${size.width}x${size.height})`,
        }],
      };
    } catch (error: any) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to tap relative coordinates: ${error.message}`);
    }
  }

  private async typeText(text: string, udid?: string) {
    const target = await resolveUdid(udid);
    try {
      const safe = text.replace(/'/g, "'\\''");
      await execAsync(`idb ui text --udid ${target} '${safe}'`);
      return {
        content: [{ type: 'text', text: `Typed "${text}" on ${target}` }],
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to type text: ${error.message}`);
    }
  }

  private async swipe(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    durationMs?: number,
    udid?: string
  ) {
    const target = await resolveUdid(udid);
    const durationSec = ((durationMs ?? 500) / 1000).toFixed(3);
    try {
      await execAsync(`idb ui swipe --udid ${target} ${fromX} ${fromY} ${toX} ${toY} --duration ${durationSec}`);
      return {
        content: [{ type: 'text', text: `Swiped (${fromX},${fromY}) to (${toX},${toY}) over ${durationMs ?? 500}ms on ${target}` }],
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

  // AI utilities

  private async tapById(id: string, udid?: string) {
    const target = await resolveUdid(udid);
    try {
      const elements = await this.fetchUiTree(target);
      const matches = findElementsById(elements, id);

      if (matches.length === 0) {
        throw new McpError(ErrorCode.InvalidRequest, `No element found with identifier "${id}"`);
      }

      const el = matches[0];
      const cx = Math.round(el.frame.x + el.frame.w / 2);
      const cy = Math.round(el.frame.y + el.frame.h / 2);

      // UISwitch requires a swipe gesture; a raw coordinate tap doesn't toggle it
      if (/switch/i.test(el.type)) {
        const isOn = el.value === '1';
        const fromX = isOn
          ? Math.round(el.frame.x + el.frame.w - 6)
          : Math.round(el.frame.x + 6);
        const toX = isOn
          ? Math.round(el.frame.x + 6)
          : Math.round(el.frame.x + el.frame.w - 6);
        await execAsync(`idb ui swipe --udid ${target} ${fromX} ${cy} ${toX} ${cy} --duration 0.15`);
        return {
          content: [{
            type: 'text',
            text: `Toggled switch "${id}" (was ${isOn ? 'ON' : 'OFF'}) at (${cx}, ${cy}) on ${target}`,
          }],
        };
      }

      await execAsync(`idb ui tap --udid ${target} ${cx} ${cy}`);
      return {
        content: [{
          type: 'text',
          text: `Tapped element with id "${id}" at (${cx}, ${cy}) on ${target}`,
        }],
      };
    } catch (error: any) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to tap by id: ${error.message}`);
    }
  }

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

      const el = pickBestTextMatch(matches, text, elements);
      const screen = getScreenFrame(elements);
      const primary = inferTapPointForText(el, text, screen);
      const candidates = buildTapPointCandidates(el, primary, screen);
      const beforeSignature = this.buildUiSignature(elements);

      let chosen = candidates[0];
      let transitioned = false;
      for (let i = 0; i < candidates.length; i++) {
        const point = candidates[i];
        await execAsync(`idb ui tap --udid ${target} ${point.x} ${point.y}`);
        chosen = point;

        const shouldProbeTransition = candidates.length > 1 && i < candidates.length - 1;
        if (!shouldProbeTransition) break;

        await new Promise((resolve) => setTimeout(resolve, 350));
        const afterProbe = await this.fetchUiTree(target);
        if (this.buildUiSignature(afterProbe) !== beforeSignature) {
          transitioned = true;
          break;
        }
      }

      return {
        content: [{
          type: 'text',
          text: `Tapped element "${el.label ?? el.value ?? text}" at (${chosen.x}, ${chosen.y}) on ${target} using ${chosen.strategy}${transitioned ? ' (transition-detected)' : ''}`,
        }],
      };
    } catch (error: any) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to tap text: ${error.message}`);
    }
  }

  // Internal helpers

  private compactElements(elements: UIElement[]) {
    return elements
      .filter((el) => isInteractiveElement(el.type) || Boolean(el.label) || Boolean(el.value))
      .map((el) => {
        const out: Record<string, any> = {
          t: el.type,
          f: [
            Math.round(el.frame.x),
            Math.round(el.frame.y),
            Math.round(el.frame.w),
            Math.round(el.frame.h),
          ],
        };

        if (el.label) out.l = el.label;
        if (el.value) out.v = el.value;
        if (el.hint) out.h = el.hint;
        if (el.enabled === false) out.e = false;

        return out;
      });
  }

  private buildUiSignature(elements: UIElement[]): string {
    return elements
      .slice(0, 64)
      .map((el) => {
        const label = String(el.label ?? '').trim();
        const value = String(el.value ?? '').trim();
        return `${el.type}:${label}:${value}:${Math.round(el.frame.x)},${Math.round(el.frame.y)},${Math.round(el.frame.w)},${Math.round(el.frame.h)}`;
      })
      .join('|');
  }

  private async fetchUiTree(udid: string): Promise<UIElement[]> {
    const { stdout } = await execAsync(`idb ui describe-all --udid ${udid}`);
    const raw: any[] = JSON.parse(stdout);
    return Array.isArray(raw) ? raw.map(normalizeElement) : [normalizeElement(raw)];
  }

  private async getScreenSize(udid: string): Promise<{ width: number; height: number }> {
    const elements = await this.fetchUiTree(udid);

    const app = elements.find((el) => /application/i.test(el.type) && el.frame.w > 0 && el.frame.h > 0);
    if (app) {
      return { width: Math.round(app.frame.w), height: Math.round(app.frame.h) };
    }

    let maxX = 0;
    let maxY = 0;
    for (const el of elements) {
      maxX = Math.max(maxX, el.frame.x + el.frame.w);
      maxY = Math.max(maxY, el.frame.y + el.frame.h);
    }

    if (maxX <= 0 || maxY <= 0) {
      throw new McpError(ErrorCode.InternalError, 'Unable to infer screen dimensions from UI tree.');
    }

    return { width: Math.round(maxX), height: Math.round(maxY) };
  }

  private async readImageSize(path: string): Promise<{ width: number; height: number }> {
    const { stdout } = await execAsync(`sips -g pixelWidth -g pixelHeight "${path}"`);
    const width = Number((stdout.match(/pixelWidth:\s*(\d+)/) ?? [])[1]);
    const height = Number((stdout.match(/pixelHeight:\s*(\d+)/) ?? [])[1]);

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error(`Failed to read image size from ${path}`);
    }

    return { width, height };
  }

  private async captureScreenshot(udid: string, options: ScreenshotOptions): Promise<ScreenshotPayload> {
    const ts = Date.now();
    const png = `/tmp/ios_sim_${ts}.png`;
    const jpg = `/tmp/ios_sim_${ts}.jpg`;

    try {
      await execAsync(`xcrun simctl io ${udid} screenshot "${png}"`);
      const source = await this.readImageSize(png);

      await execAsync(
        `sips -s format jpeg -s formatOptions ${options.quality} -Z ${options.maxDim} "${png}" --out "${jpg}"`
      );

      const sent = await this.readImageSize(jpg);
      const buf = await readFile(jpg);

      return {
        base64: buf.toString('base64'),
        hash: createHash('sha256').update(buf).digest('hex'),
        sourceWidth: source.width,
        sourceHeight: source.height,
        sentWidth: sent.width,
        sentHeight: sent.height,
        maxDim: options.maxDim,
        quality: options.quality,
      };
    } finally {
      execAsync(`rm -f "${png}" "${jpg}"`).catch(() => {});
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
