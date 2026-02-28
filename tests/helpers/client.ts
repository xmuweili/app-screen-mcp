import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(__dirname, '../../dist/index.js');

export interface McpSession {
  client: Client;
  cleanup: () => Promise<void>;
}

export async function createMcpClient(): Promise<McpSession> {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [SERVER_PATH],
    stderr: 'ignore',
  });

  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  return {
    client,
    cleanup: async () => {
      await client.close();
    },
  };
}

/**
 * Call a tool and return the parsed JSON from the first text content block,
 * or the raw text string if it is not valid JSON.
 */
export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown> = {}
): Promise<any> {
  const result = await client.callTool({ name, arguments: args });
  const first = (result.content as any[])[0];
  if (!first || first.type !== 'text') return result.content;
  try {
    return JSON.parse(first.text);
  } catch {
    return first.text as string;
  }
}
