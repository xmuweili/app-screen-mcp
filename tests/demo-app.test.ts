/**
 * MCP-driven integration tests for the MCPDemo app.
 *
 * Communication path:
 *   node:test → MCP Client (StdioClientTransport)
 *             → app-screen-mcp server (dist/index.js)
 *             → idb / xcrun simctl
 *             → iOS Simulator (MCPDemo app)
 *
 * Every assertion is derived from MCP tool responses — no XCTest APIs used.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpClient, type McpSession } from './helpers/client.js';
import {
  launchApp, tapId, typeText, swipe,
  findById,
  assertExists, assertLabelContains, assertStatValue,
  sleep, waitUntil,
} from './helpers/ui.js';
import { screenshotHash, takeScreenshot, getScreenSummary, tapRelativeById, saveScreenshot } from './helpers/vision.js';

const BUNDLE_ID = 'com.mcpdemo.MCPDemo';

// ─── Tab helpers ──────────────────────────────────────────────────────────────

async function goHome(s: McpSession)     { await tapId(s.client, 'tab_home');     await sleep(300); }
async function goControls(s: McpSession) { await tapId(s.client, 'tab_controls'); await sleep(300); }
async function goList(s: McpSession)     { await tapId(s.client, 'tab_list');     await sleep(300); }

/** Navigate to Home and return the label of the last-action element. */
async function lastAction(s: McpSession): Promise<string> {
  await goHome(s);
  const el = await assertExists(s.client, 'home_last_action');
  return el.label ?? '';
}

// ─── Suite setup ──────────────────────────────────────────────────────────────

let session: McpSession;

before(async () => {
  session = await createMcpClient();
});

after(async () => {
  await session.cleanup();
});

beforeEach(async () => {
  // Fresh launch for each test so state is clean
  await launchApp(session.client, BUNDLE_ID);
});

// ─── 1. App launches ──────────────────────────────────────────────────────────

describe('App launches', () => {
  it('shows all three tab bar buttons', async () => {
    await assertExists(session.client, 'tab_home');
    await assertExists(session.client, 'tab_controls');
    await assertExists(session.client, 'tab_list');
  });
});

// ─── 2. Tab navigation ────────────────────────────────────────────────────────

describe('Tab navigation', () => {
  it('navigates to Controls tab', async () => {
    await goControls(session);
    await assertExists(session.client, 'ctrl_increment');
  });

  it('navigates to List tab', async () => {
    await goList(session);
    await assertExists(session.client, 'list_item_1');
  });

  it('navigates back to Home tab', async () => {
    await goControls(session);
    await goHome(session);
    await assertExists(session.client, 'home_increment');
  });
});

// ─── 3. Home — Quick Actions ──────────────────────────────────────────────────

describe('Home quick actions', () => {
  it('increment updates counter stat', async () => {
    await goHome(session);
    await tapId(session.client, 'home_increment');
    await sleep(300);
    await waitUntil(async () => {
      await assertStatValue(session.client, 'home_stat_counter', '1');
    });
  });

  it('decrement updates counter stat', async () => {
    await goHome(session);
    await tapId(session.client, 'home_increment');
    await tapId(session.client, 'home_increment');
    await sleep(300);
    await tapId(session.client, 'home_decrement');
    await sleep(300);
    await waitUntil(async () => {
      await assertStatValue(session.client, 'home_stat_counter', '1');
    });
  });

  it('reset sets counter to 0', async () => {
    await goHome(session);
    await tapId(session.client, 'home_increment');
    await tapId(session.client, 'home_increment');
    await tapId(session.client, 'home_reset');
    await sleep(300);
    await waitUntil(async () => {
      await assertStatValue(session.client, 'home_stat_counter', '0');
    });
  });

  it('last action shows Incremented after increment', async () => {
    await goHome(session);
    await tapId(session.client, 'home_increment');
    await sleep(300);
    const label = await lastAction(session);
    assert.ok(label.includes('Incremented'), `Expected "Incremented" in "${label}"`);
  });

  it('last action shows Decremented after decrement', async () => {
    await goHome(session);
    await tapId(session.client, 'home_decrement');
    await sleep(300);
    const label = await lastAction(session);
    assert.ok(label.includes('Decremented'), `Expected "Decremented" in "${label}"`);
  });

  it('last action shows reset after reset', async () => {
    await goHome(session);
    await tapId(session.client, 'home_reset');
    await sleep(300);
    const label = await lastAction(session);
    assert.ok(label.toLowerCase().includes('reset'), `Expected "reset" in "${label}"`);
  });
});

// ─── 4. Home stats reflect Controls actions ───────────────────────────────────

describe('Home stats reflect Controls actions', () => {
  it('counter stat reflects Controls increments', async () => {
    await goControls(session);
    await tapId(session.client, 'ctrl_increment');
    await tapId(session.client, 'ctrl_increment');
    await tapId(session.client, 'ctrl_increment');
    await sleep(300);

    await goHome(session);
    await waitUntil(async () => {
      await assertStatValue(session.client, 'home_stat_counter', '3');
    });
  });

  it('submitted count increments after text submission', async () => {
    await goControls(session);
    await tapId(session.client, 'ctrl_text_input');
    await sleep(200);
    await typeText(session.client, 'hello');
    await tapId(session.client, 'ctrl_submit');
    await sleep(300);

    await goHome(session);
    await waitUntil(async () => {
      await assertStatValue(session.client, 'home_stat_submitted', '1');
    });
  });

  it('toggle stat reflects Controls toggle', async () => {
    await goHome(session);
    await assertStatValue(session.client, 'home_stat_toggle', 'OFF');

    await goControls(session);
    await tapId(session.client, 'ctrl_toggle');
    await sleep(300);

    await goHome(session);
    await waitUntil(async () => {
      await assertStatValue(session.client, 'home_stat_toggle', 'ON');
    });
  });
});

// ─── 5. Controls — Counter ────────────────────────────────────────────────────

describe('Controls counter', () => {
  it('increment increases counter value', async () => {
    await goControls(session);
    const before = await assertExists(session.client, 'ctrl_counter_value');
    // label format: "Counter value N"
    const initial = parseInt((before.label ?? '').split(' ').pop() ?? '0', 10);

    await tapId(session.client, 'ctrl_increment');
    await sleep(300);

    await waitUntil(async () => {
      const el = await assertExists(session.client, 'ctrl_counter_value');
      const val = parseInt((el.label ?? '').split(' ').pop() ?? '0', 10);
      assert.equal(val, initial + 1);
    });
  });

  it('decrement decreases counter value', async () => {
    await goControls(session);
    const before = await assertExists(session.client, 'ctrl_counter_value');
    const initial = parseInt((before.label ?? '').split(' ').pop() ?? '0', 10);

    await tapId(session.client, 'ctrl_decrement');
    await sleep(300);

    await waitUntil(async () => {
      const el = await assertExists(session.client, 'ctrl_counter_value');
      const val = parseInt((el.label ?? '').split(' ').pop() ?? '0', 10);
      assert.equal(val, initial - 1);
    });
  });
});

// ─── 6. Controls — Text Input ─────────────────────────────────────────────────

describe('Controls text input', () => {
  it('submit button is disabled when field is empty', async () => {
    await goControls(session);
    // Clear if needed
    const clear = await findById(session.client, 'ctrl_text_clear');
    if (clear.length > 0) await tapId(session.client, 'ctrl_text_clear');
    await sleep(200);

    const submit = await assertExists(session.client, 'ctrl_submit');
    assert.equal(submit.enabled, false, 'Submit should be disabled when empty');
  });

  it('submit button is enabled after typing', async () => {
    await goControls(session);
    await tapId(session.client, 'ctrl_text_input');
    await sleep(200);
    await typeText(session.client, 'test');
    await sleep(200);

    const submit = await assertExists(session.client, 'ctrl_submit');
    assert.equal(submit.enabled, true, 'Submit should be enabled after typing');
  });

  it('submit clears the field (clear button disappears)', async () => {
    await goControls(session);
    await tapId(session.client, 'ctrl_text_input');
    await sleep(200);
    await typeText(session.client, 'Hello MCP');
    await tapId(session.client, 'ctrl_submit');
    await sleep(300);

    const clear = await findById(session.client, 'ctrl_text_clear');
    assert.equal(clear.length, 0, 'Clear button should disappear after submit');
  });

  it('submitted text appears in the list', async () => {
    await goControls(session);
    await tapId(session.client, 'ctrl_text_input');
    await sleep(200);
    await typeText(session.client, 'TestEntry');
    await tapId(session.client, 'ctrl_submit');
    await sleep(300);

    await waitUntil(async () => {
      await assertExists(session.client, 'ctrl_submitted_text');
    });
  });

  it('clear button removes text', async () => {
    await goControls(session);
    await tapId(session.client, 'ctrl_text_input');
    await sleep(200);
    await typeText(session.client, 'something');
    await sleep(200);

    await assertExists(session.client, 'ctrl_text_clear');
    await tapId(session.client, 'ctrl_text_clear');
    await sleep(300);

    const clear = await findById(session.client, 'ctrl_text_clear');
    assert.equal(clear.length, 0, 'Clear button should disappear after clearing');
  });

  it('submit updates last action with submitted text', async () => {
    await goControls(session);
    await tapId(session.client, 'ctrl_text_input');
    await sleep(200);
    await typeText(session.client, 'FooBar');
    await sleep(800); // let autocorrect/keyboard settle before tapping submit
    await tapId(session.client, 'ctrl_submit');
    await sleep(300);

    const label = await lastAction(session);
    assert.ok(
      label.includes('Submitted') && label.includes('FooBar'),
      `Expected "Submitted" and "FooBar" in "${label}"`
    );
  });
});

// ─── 7. Controls — Accent Color ──────────────────────────────────────────────

const COLORS = ['indigo', 'coral', 'teal', 'orange', 'purple'] as const;

describe('Controls accent color', () => {
  for (const color of COLORS) {
    it(`selecting ${color} marks it as selected and updates last action`, async () => {
      await goControls(session);
      await tapId(session.client, `ctrl_color_${color}`);
      await sleep(300);

      await waitUntil(async () => {
        await assertLabelContains(session.client, `ctrl_color_${color}`, 'selected');
      });

      const label = await lastAction(session);
      assert.ok(
        label.toLowerCase().includes(color),
        `Expected "${color}" in last action "${label}"`
      );
    });
  }

  it('only one color is selected at a time', async () => {
    await goControls(session);
    await tapId(session.client, 'ctrl_color_teal');
    await sleep(200);
    await tapId(session.client, 'ctrl_color_orange');
    await sleep(300);

    await waitUntil(async () => {
      const teal = await assertExists(session.client, 'ctrl_color_teal');
      assert.ok(!(teal.label ?? '').includes('selected'), 'Teal should not remain selected');
      await assertLabelContains(session.client, 'ctrl_color_orange', 'selected');
    });
  });
});

// ─── 8. Controls — Toggle ────────────────────────────────────────────────────

describe('Controls toggle', () => {
  it('toggle starts off', async () => {
    await goControls(session);
    const sw = await assertExists(session.client, 'ctrl_toggle');
    // Ensure off
    if (sw.value === '1') {
      await tapId(session.client, 'ctrl_toggle');
      await sleep(300);
    }
    const after = await assertExists(session.client, 'ctrl_toggle');
    assert.equal(after.value, '0', 'Toggle should be off');
  });

  it('toggling on changes value to 1', async () => {
    await goControls(session);
    const sw = await assertExists(session.client, 'ctrl_toggle');
    if (sw.value === '1') { await tapId(session.client, 'ctrl_toggle'); await sleep(300); }

    await tapId(session.client, 'ctrl_toggle');
    await sleep(300);

    await waitUntil(async () => {
      const el = await assertExists(session.client, 'ctrl_toggle');
      assert.equal(el.value, '1');
    });
  });

  it('toggling off changes value to 0', async () => {
    await goControls(session);
    const sw = await assertExists(session.client, 'ctrl_toggle');
    if (sw.value === '0') { await tapId(session.client, 'ctrl_toggle'); await sleep(300); }

    await tapId(session.client, 'ctrl_toggle');
    await sleep(300);

    await waitUntil(async () => {
      const el = await assertExists(session.client, 'ctrl_toggle');
      assert.equal(el.value, '0');
    });
  });

  it('toggle → ON appears in last action', async () => {
    await goControls(session);
    const sw = await assertExists(session.client, 'ctrl_toggle');
    if (sw.value === '1') { await tapId(session.client, 'ctrl_toggle'); await sleep(300); }

    await tapId(session.client, 'ctrl_toggle');
    await sleep(300);

    const label = await lastAction(session);
    assert.ok(
      label.includes('Toggle') && label.includes('ON'),
      `Expected "Toggle" and "ON" in "${label}"`
    );
  });
});

// ─── 9. List Tab ─────────────────────────────────────────────────────────────

describe('List tab', () => {
  it('list items 1-5 exist', async () => {
    await goList(session);
    for (let i = 1; i <= 5; i++) {
      await assertExists(session.client, `list_item_${i}`);
    }
  });

  it('tapping list item 1 updates last action', async () => {
    await goList(session);
    await tapId(session.client, 'list_item_1');
    await sleep(500);

    const label = await lastAction(session);
    assert.ok(label.includes('Item 1'), `Expected "Item 1" in "${label}"`);
  });

  it('tapping list item 3 updates last action', async () => {
    await goList(session);
    await tapId(session.client, 'list_item_3');
    await sleep(500);

    const label = await lastAction(session);
    assert.ok(label.includes('Item 3'), `Expected "Item 3" in "${label}"`);
  });

  it('scrolling reveals and taps list item 10', async () => {
    await goList(session);
    // Swipe up to scroll down — use approximate screen midpoint for iPhone
    await swipe(session.client, 195, 600, 195, 200, 400);
    await sleep(500);

    await waitUntil(async () => {
      await assertExists(session.client, 'list_item_10');
    }, 4000);

    await tapId(session.client, 'list_item_10');
    await sleep(500);

    const label = await lastAction(session);
    assert.ok(label.includes('Item 10'), `Expected "Item 10" in "${label}"`);
  });

  it('scrolling further reveals and taps list item 20', async () => {
    await goList(session);
    for (let i = 0; i < 3; i++) {
      await swipe(session.client, 195, 600, 195, 200, 400);
      await sleep(400);
    }

    await waitUntil(async () => {
      await assertExists(session.client, 'list_item_20');
    }, 6000);

    await tapId(session.client, 'list_item_20');
    await sleep(500);

    const label = await lastAction(session);
    assert.ok(label.includes('Item 20'), `Expected "Item 20" in "${label}"`);
  });
});

// ─── 10. Cross-tab state persistence ─────────────────────────────────────────

describe('Cross-tab state persistence', () => {
  it('counter persists across tab switches', async () => {
    await goHome(session);
    await tapId(session.client, 'home_reset');
    await sleep(200);
    await tapId(session.client, 'home_increment');
    await tapId(session.client, 'home_increment');
    await sleep(200);

    await goList(session);
    await goControls(session);

    await waitUntil(async () => {
      const el = await assertExists(session.client, 'ctrl_counter_value');
      const val = parseInt((el.label ?? '').split(' ').pop() ?? '', 10);
      assert.equal(val, 2, `Expected counter 2, got ${val}`);
    });
  });

  it('submitted count persists after switching tabs', async () => {
    await goControls(session);
    await tapId(session.client, 'ctrl_text_input');
    await sleep(200);
    await typeText(session.client, 'Persist test');
    await tapId(session.client, 'ctrl_submit');
    await sleep(300);

    await goList(session);
    await goHome(session);

    await assertStatValue(session.client, 'home_stat_submitted', '1');
  });
});

// ─── 11. Vision — screenshot change detection ─────────────────────────────────
//
// These tests use the take_screenshot hash to verify the screen visually changes
// after an interaction, without involving any LLM or accessibility tree queries.

describe('Vision — screenshot changes', () => {
  it('screenshot hash changes after increment', async () => {
    await goHome(session);
    const h1 = await screenshotHash(session.client);
    await tapId(session.client, 'home_increment');
    await sleep(400);
    const h2 = await screenshotHash(session.client);
    assert.notEqual(h1, h2, 'Expected screenshot to change after increment');
  });

  it('screenshot hash changes after tab navigation', async () => {
    await goHome(session);
    const h1 = await screenshotHash(session.client);
    await goControls(session);
    const h2 = await screenshotHash(session.client);
    assert.notEqual(h1, h2, 'Expected screenshot to change after switching to Controls tab');
  });

  it('screenshot hash changes after selecting a different accent color', async () => {
    await goControls(session);
    await tapId(session.client, 'ctrl_color_indigo');
    await sleep(300);
    const h1 = await screenshotHash(session.client);
    await tapId(session.client, 'ctrl_color_coral');
    await sleep(300);
    const h2 = await screenshotHash(session.client);
    assert.notEqual(h1, h2, 'Expected screenshot to change after switching accent color');
  });
});

// ─── 12. Vision — screen summary (tree + screenshot) ─────────────────────────
//
// These tests use get_screen_summary, which returns the accessibility tree AND
// a screenshot in one call. No LLM API key is required — the AI caller can
// view the returned image content blocks directly via its own vision capability.

describe('Vision — screen summary', () => {
  it('home screen summary has elements and a valid JPEG screenshot', async () => {
    await goHome(session);
    const summary = await getScreenSummary(session.client);
    assert.ok(summary.elements.length > 0, 'Expected non-empty element tree');
    assert.ok(summary.screenshot.base64.length > 1000, 'Expected non-trivial JPEG data');
    assert.ok(summary.screenshot.sourceWidth > 0 && summary.screenshot.sourceHeight > 0,
      'Expected valid source dimensions');
  });

  it('controls screen summary includes ctrl_toggle in the tree', async () => {
    await goControls(session);
    const summary = await getScreenSummary(session.client);
    const toggle = summary.elements.find((e) => e.identifier === 'ctrl_toggle');
    assert.ok(toggle, 'ctrl_toggle should appear in the tree from get_screen_summary');
    assert.ok(summary.screenshot.base64.length > 1000, 'Expected non-trivial JPEG data');
  });

  it('screen summary before and after toggle shows different screenshots', async () => {
    await goControls(session);
    const before = await getScreenSummary(session.client);
    await tapId(session.client, 'ctrl_toggle');
    await sleep(400);
    const after = await getScreenSummary(session.client);
    assert.notEqual(before.screenshot.hash, after.screenshot.hash,
      'Screenshot hash should differ after toggling the switch');
    // Restore toggle state
    await tapId(session.client, 'ctrl_toggle');
  });

  it('screenshot dimensions are consistent with the UI tree screen size', async () => {
    await goHome(session);
    const shot = await takeScreenshot(session.client);
    // Source dimensions are in pixels (retina); sent dimensions are scaled down.
    assert.ok(shot.sourceWidth >= shot.sentWidth, 'Source width should be >= sent width');
    assert.ok(shot.sourceHeight >= shot.sentHeight, 'Source height should be >= sent height');
    assert.ok(shot.sentWidth > 200 && shot.sentHeight > 300, 'Sent image should have reasonable dimensions');
  });
});

// ─── 13. Vision — tap by relative coordinate ─────────────────────────────────
//
// These tests use tap_relative with (rx, ry) derived from accessibility element
// frames — the same coordinate space the server uses — to verify that visual
// coordinate tapping works correctly without relying on tap_id.

describe('Vision — tap_relative', () => {
  it('navigates to Controls tab via relative-coordinate tap', async () => {
    await goHome(session);
    await tapRelativeById(session.client, 'tab_controls');
    await sleep(400);
    await waitUntil(async () => {
      await assertExists(session.client, 'ctrl_toggle');
    }, 3000);
  });

  it('navigates to List tab via relative-coordinate tap', async () => {
    await goHome(session);
    await tapRelativeById(session.client, 'tab_list');
    await sleep(400);
    await waitUntil(async () => {
      await assertExists(session.client, 'list_item_1');
    }, 3000);
  });

  it('taps the increment button via relative coordinate and counter updates', async () => {
    await goHome(session);
    await tapId(session.client, 'home_reset');
    await sleep(200);
    await tapRelativeById(session.client, 'home_increment');
    await sleep(400);
    await waitUntil(async () => {
      await assertStatValue(session.client, 'home_stat_counter', '1');
    }, 3000);
  });
});

// ─── 14. Vision — inspection snapshots ───────────────────────────────────────
//
// Each test saves a JPEG to test-screenshots/<name>.jpg and records the path in
// a diagnostic message. The AI caller can read those files with its vision
// capability to verify visual correctness without any embedded LLM API calls.
//
// Run individually:
//   node --test --import tsx/esm --test-name-pattern "inspection" tests/demo-app.test.ts

describe('Vision — inspection snapshots', () => {
  it('home tab: initial state', async (ctx) => {
    await goHome(session);
    const file = await saveScreenshot(session.client, 'home-initial');
    ctx.diagnostic(`screenshot → ${file}`);
  });

  it('home tab: after two increments', async (ctx) => {
    await goHome(session);
    await tapId(session.client, 'home_increment');
    await tapId(session.client, 'home_increment');
    await sleep(300);
    const file = await saveScreenshot(session.client, 'home-after-2-increments');
    ctx.diagnostic(`screenshot → ${file}`);
  });

  it('controls tab: toggle OFF (default)', async (ctx) => {
    await goControls(session);
    const sw = await assertExists(session.client, 'ctrl_toggle');
    if (sw.value === '1') { await tapId(session.client, 'ctrl_toggle'); await sleep(300); }
    const file = await saveScreenshot(session.client, 'controls-toggle-off');
    ctx.diagnostic(`screenshot → ${file}`);
  });

  it('controls tab: toggle ON', async (ctx) => {
    await goControls(session);
    const sw = await assertExists(session.client, 'ctrl_toggle');
    if (sw.value !== '1') { await tapId(session.client, 'ctrl_toggle'); await sleep(300); }
    const file = await saveScreenshot(session.client, 'controls-toggle-on');
    ctx.diagnostic(`screenshot → ${file}`);
  });

  it('controls tab: each accent color selected', async (ctx) => {
    await goControls(session);
    const colors = ['indigo', 'coral', 'teal', 'orange', 'purple'] as const;
    const files: string[] = [];
    for (const color of colors) {
      await tapId(session.client, `ctrl_color_${color}`);
      await sleep(300);
      files.push(await saveScreenshot(session.client, `controls-color-${color}`));
    }
    ctx.diagnostic(`screenshots → ${files.join(', ')}`);
  });

  it('list tab: initial view (items 1–5 visible)', async (ctx) => {
    await goList(session);
    const file = await saveScreenshot(session.client, 'list-initial');
    ctx.diagnostic(`screenshot → ${file}`);
  });

  it('list tab: after scrolling to item 10', async (ctx) => {
    await goList(session);
    await waitUntil(async () => {
      await swipe(session.client, 195, 600, 195, 200, 400);
      await sleep(300);
      await assertExists(session.client, 'list_item_10');
    }, 6000);
    const file = await saveScreenshot(session.client, 'list-scrolled-item-10');
    ctx.diagnostic(`screenshot → ${file}`);
  });
});
