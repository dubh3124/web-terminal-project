import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as pty from 'node-pty';
import * as fs from 'fs/promises';
import path from 'path';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

let mcpPtyProcess: pty.IPty;

function initializeMcpPty(): pty.IPty {
  if (mcpPtyProcess) {
    console.log('MCP PTY already initialized.');
    return mcpPtyProcess;
  }

  const shell = process.env.SHELL || '/bin/bash';
  const cols = 120;
  const rows = 40;

  console.log(`Initializing MCP PTY (${shell}) with size: ${cols}x${rows}`);
  try {
    mcpPtyProcess = pty.spawn(shell, [], {
      cwd: process.env.HOME || '/home/termuser',
      env: {
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8',
        USER: 'termuser',
        HOME: process.env.HOME || '/home/termuser'
      },
      cols,
      rows,
      encoding: 'utf8'
    });
  } catch (error: any) {
    console.error(`Failed to spawn MCP PTY: ${error.message}`);
    throw error;
  }
  return mcpPtyProcess;
}

function createResponse(
  { stdout, stderr, success }: { stdout: string; stderr: string; success: boolean },
  timedOut = false
): CallToolResult {
  return {
    structuredContent: {
      stdout: JSON.stringify(stdout),
      stderr: stderr ? JSON.stringify(stderr) : undefined,
      exitCode: success ? 0 : 1,
      success: success && !timedOut
    },
    content: [{ type: 'text', text: stdout || (stderr ? `Error: ${stderr}` : 'No output') }],
    isError: !success
  };
}

initializeMcpPty();

export const mcpServer = new McpServer({
  name: 'web-terminal-mcp',
  version: '1.0.0',
  capabilities: {
    tools: {},
    resources: {},
    prompts: {}
  }
});

mcpServer.registerTool(
  'stream-command-output',
  {
    title: 'Stream Command Output',
    description: 'Executes a shell command and streams the output as it is produced.',
    inputSchema: {
      command: z.string(),
      timeoutMs: z.number().optional().describe('Optional timeout in milliseconds')
    },
    outputSchema: {
      stdout: z.string(),
      stderr: z.string().optional(),
      exitCode: z.number().optional(),
      success: z.boolean()
    },
  },
  async ({ command, timeoutMs = 10000 }, extra): Promise<CallToolResult> => {
    console.log(`Executing command: ${command}`);
    if (!command.trim()) {
      console.warn('Received empty command');
      return createResponse({ stdout: '', stderr: 'Empty command', success: false });
    }

    const stream = (extra as any).stream;
    const ptySession = mcpPtyProcess || initializeMcpPty();
    const shellPromptRegex = /termuser@.*:\~\$\s*$/m;

    let fullOutput = '';
    let outputComplete = false;

    const listener = ptySession.onData((chunk: string) => {
      console.log(`PTY Output Chunk: ${chunk}`);
      fullOutput += chunk;

      stream?.({
        content: [{ type: 'text', text: chunk }],
        isError: false
      });

      if (shellPromptRegex.test(fullOutput)) {
        console.log('Shell prompt detected, ending session.');
        outputComplete = true;
        listener.dispose();
      }
    });

    ptySession.write(`${command}\r`);
    console.log(`Written to PTY: ${command}`);

    let timedOut = false;
    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (outputComplete) {
          console.log('Output complete. Clearing interval.');
          clearInterval(interval);
          resolve(null);
        }
      }, 100);

      setTimeout(() => {
        if (!outputComplete) {
          console.warn('Shell prompt not detected, forcing end.');
          listener.dispose();
          timedOut = true;
          resolve(null);
        }
      }, timeoutMs);
    });

    const cleanOutput = fullOutput.replace(shellPromptRegex, '').trim();
    console.log(`Final output: ${cleanOutput}`);

    return createResponse({ stdout: cleanOutput, stderr: '', success: !timedOut }, timedOut);
  }
);

export default mcpServer;
