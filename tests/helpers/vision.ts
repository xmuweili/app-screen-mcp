/**
 * Vision helpers for MCP-driven tests.
 *
 * No LLM API calls are made here. Screenshot data is returned as-is so that
 * the AI caller (whoever is operating the MCP server interactively) can view
 * and interpret the visual content using its own vision capabilities.
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { callTool } from './client.js';
import type { UIElement } from './ui.js';

// ─── Screenshot helpers ────────────────────────────────────────────────────────

export interface ScreenshotMeta {
  hash: string;
  sourceWidth: number;
  sourceHeight: number;
  sentWidth: number;
  sentHeight: number;
}

/**
 * Take a screenshot and return its hash (for change-detection assertions).
 */
export async function screenshotHash(client: Client): Promise<string> {
  const meta = await callTool(client, 'take_screenshot', {});
  return meta.hash as string;
}

/**
 * Take a screenshot and return both the base64 JPEG and metadata.
 * The base64 image is surfaced to the calling AI via the MCP image content block.
 */
export async function takeScreenshot(client: Client): Promise<ScreenshotMeta & { base64: string }> {
  const result = await client.callTool({ name: 'take_screenshot', arguments: {} });
  const blocks = result.content as any[];
  const meta = JSON.parse(blocks[0].text);
  const img = blocks.find((b: any) => b.type === 'image');
  if (!img) throw new Error('take_screenshot returned no image block');
  return {
    base64: img.data as string,
    hash: meta.hash as string,
    sourceWidth: meta.source_width as number,
    sourceHeight: meta.source_height as number,
    sentWidth: meta.sent_width as number,
    sentHeight: meta.sent_height as number,
  };
}

// ─── Screen summary helper ─────────────────────────────────────────────────────

export interface ScreenSummary {
  elements: UIElement[];
  screenshot: ScreenshotMeta & { base64: string };
}

/**
 * Call get_screen_summary and return the parsed UI tree + screenshot together.
 * This is the primary "see + read" tool — it gives the AI caller both the
 * accessibility tree and the visual frame in one call.
 */
export async function getScreenSummary(client: Client): Promise<ScreenSummary> {
  const result = await client.callTool({ name: 'get_screen_summary', arguments: {} });
  const blocks = result.content as any[];
  const meta = JSON.parse(blocks[0].text);
  const img = blocks.find((b: any) => b.type === 'image');
  if (!img) throw new Error('get_screen_summary returned no image block');
  return {
    elements: (meta.elements ?? []) as UIElement[],
    screenshot: {
      base64: img.data as string,
      hash: meta.image?.hash ?? '',
      sourceWidth: meta.image?.source_width ?? 0,
      sourceHeight: meta.image?.source_height ?? 0,
      sentWidth: meta.image?.sent_width ?? 0,
      sentHeight: meta.image?.sent_height ?? 0,
    },
  };
}

// ─── tap_relative helpers ─────────────────────────────────────────────────────

/**
 * Tap an element by accessibility id using relative (rx, ry) coordinates.
 * Derives the fraction from the element's center frame divided by the app
 * container size — the same coordinate space the server's tap_relative uses.
 */
export async function tapRelativeById(client: Client, id: string): Promise<void> {
  const tree = (await callTool(client, 'get_ui_tree', {})) as UIElement[];

  const el = tree.find((e) => e.identifier === id);
  if (!el) throw new Error(`Element with id "${id}" not found in UI tree`);

  const app = tree.find((e) => /application/i.test(e.type) && e.frame.w > 0 && e.frame.h > 0);
  const W = app?.frame.w ?? 390;
  const H = app?.frame.h ?? 844;

  const rx = Math.min(Math.max((el.frame.x + el.frame.w / 2) / W, 0), 1);
  const ry = Math.min(Math.max((el.frame.y + el.frame.h / 2) / H, 0), 1);

  await callTool(client, 'tap_relative', { rx, ry });
}
