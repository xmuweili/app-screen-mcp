import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { callTool } from './client.js';

export interface UIElement {
  type: string;
  identifier?: string | null;
  label?: string | null;
  value?: string | null;
  hint?: string | null;
  frame: { x: number; y: number; w: number; h: number };
  enabled?: boolean;
}

// ─── Tool wrappers ────────────────────────────────────────────────────────────

export async function launchApp(client: Client, bundleId: string): Promise<void> {
  // Terminate first so state is fully reset (mirrors XCTest's app.launch())
  await callTool(client, 'terminate_app', { bundle_id: bundleId });
  await sleep(300);
  await callTool(client, 'launch_app', { bundle_id: bundleId });
  await sleep(1000);
}

export async function tapId(client: Client, id: string): Promise<string> {
  return callTool(client, 'tap_id', { id });
}

export async function tapText(client: Client, text: string): Promise<string> {
  return callTool(client, 'tap_text', { text });
}

export async function typeText(client: Client, text: string): Promise<string> {
  return callTool(client, 'type_text', { text });
}

export async function swipe(
  client: Client,
  fromX: number, fromY: number,
  toX: number, toY: number,
  durationMs?: number
): Promise<string> {
  return callTool(client, 'swipe', { from_x: fromX, from_y: fromY, to_x: toX, to_y: toY, duration_ms: durationMs });
}

export async function getUITree(client: Client): Promise<UIElement[]> {
  const raw = await callTool(client, 'get_ui_tree', {});
  return Array.isArray(raw) ? raw : [];
}

// ─── Element queries ──────────────────────────────────────────────────────────

export async function findById(client: Client, id: string): Promise<UIElement[]> {
  const tree = await getUITree(client);
  return tree.filter((el) => el.identifier === id);
}

export async function findByText(client: Client, query: string): Promise<UIElement[]> {
  const result = await callTool(client, 'find_elements', { query });
  return (result?.elements ?? []) as UIElement[];
}

// ─── Assertions ───────────────────────────────────────────────────────────────

export async function assertExists(client: Client, id: string, msg?: string): Promise<UIElement> {
  const els = await findById(client, id);
  assert.ok(els.length > 0, msg ?? `Expected element with id "${id}" to exist`);
  return els[0];
}

/** Assert the label of the element with the given accessibility identifier. */
export async function assertLabel(
  client: Client, id: string, expected: string, msg?: string
): Promise<void> {
  const el = await assertExists(client, id);
  assert.equal(
    el.label,
    expected,
    msg ?? `Element "${id}": expected label "${expected}", got "${el.label}"`
  );
}

/** Assert the value of the element with the given accessibility identifier. */
export async function assertValue(
  client: Client, id: string, expected: string, msg?: string
): Promise<void> {
  const el = await assertExists(client, id);
  assert.equal(
    el.value,
    expected,
    msg ?? `Element "${id}": expected value "${expected}", got "${el.value}"`
  );
}

/**
 * Assert that at least one element with the given identifier has a label
 * equal to `expected`. Handles the idb quirk where a parent container's
 * AXUniqueId is propagated to all its children (e.g. StatCard).
 */
export async function assertStatValue(
  client: Client, id: string, expected: string, msg?: string
): Promise<void> {
  const tree = await getUITree(client);
  const matches = tree.filter((el) => el.identifier === id && el.label === expected);
  assert.ok(
    matches.length > 0,
    msg ?? `Expected element with id "${id}" to have label "${expected}" (found labels: ${
      tree.filter((el) => el.identifier === id).map((el) => el.label).join(', ')
    })`
  );
}

/** Assert that element label contains a substring. */
export async function assertLabelContains(
  client: Client, id: string, substr: string, msg?: string
): Promise<void> {
  const el = await assertExists(client, id);
  assert.ok(
    (el.label ?? '').includes(substr),
    msg ?? `Element "${id}": expected label to contain "${substr}", got "${el.label}"`
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll `fn` until it returns without throwing or times out.
 */
export async function waitUntil(
  fn: () => Promise<void>,
  timeoutMs = 5000,
  intervalMs = 300
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await fn();
      return;
    } catch (err) {
      lastError = err;
      await sleep(intervalMs);
    }
  }
  throw lastError;
}
