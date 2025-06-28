import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as pty from 'node-pty';
import * as fs from 'fs/promises';
import path from 'path';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol'; // Import RequestHandlerExtra
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'; // <-- Import CallToolResult type

// --- Global PTY Instance for MCP Execution ---
let mcpPtyProcess: pty.IPty

function initializeMcpPty(): pty.IPty {
    if (mcpPtyProcess) {
        console.log('MCP PTY already initialized.');
        return mcpPtyProcess;
    }

    const shell = process.env.SHELL || '/bin/bash';
    const cols = 120; // Default columns for LLM interactions
    const rows = 40;  // Default rows for LLM interactions

    console.log(`Initializing MCP PTY (${shell}) with size: ${cols}x${rows}`);
    try {
        mcpPtyProcess = pty.spawn(shell, [], {
            name: 'xterm-256color',
            cols: cols,
            rows: rows,
            cwd: process.env.HOME || '/home/termuser', // Ensure this directory exists and is writable
            env: {
                // Keep only essential env vars
                // TERM: 'xterm-256color',
                LANG: 'en_US.UTF-8',
                LC_ALL: 'en_US.UTF-8',
                PS1: '#MCP$ ', // Simplified prompt
                USER: 'termuser', // Ensure user is set
                HOME: process.env.HOME || '/home/termuser' // Explicitly set HOME
            },
            encoding: 'utf8'
        });

        // Add error handling directly on the PTY process
        mcpPtyProcess.onData((data: string) => {
            console.log(`MCP PTY OUTPUT: ${data}`);
            // Attempt to kill and reinitiate
        });

        mcpPtyProcess.onExit(({ exitCode, signal }) => {
            console.log(`MCP PTY exited with code ${exitCode}, signal ${signal}. Marking for recreation.`);
            // Optionally, add a delay before auto-recreating if it crashes quickly
            // setTimeout(initializeMcpPty, 1000);
        });

    } catch (error: any) {
        console.error(`Failed to spawn MCP PTY: ${error.message}`);
        mcpPtyProcess.kill();
    }
    return mcpPtyProcess;
}

// Ensure MCP PTY is initialized on module load
initializeMcpPty();


// --- MCP Server Definition ---
export const mcpServer = new McpServer({
    name: 'web-terminal-mcp',
    version: '1.0.0',
    capabilities: {
        tools: {},
        resources: {},
        prompts: {}
    }
});

// --- MCP Tool: execute-command ---
mcpServer.registerTool(
    'execute-command',
    {
        title: 'Execute Shell Command',
        description: 'Executes a single shell command in the terminal and returns its output.',
        inputSchema: {
            command: z.string().describe('The shell command to execute.'),
            timeoutMs: z.number().int().min(100).optional().describe('Optional timeout in milliseconds for the command to complete. Defaults to 5000ms. Max 30000ms.'),
            interactive: z.boolean().optional().describe('Set to true if command requires interaction (e.g., sudo, ftp). Behaves as a true TTY session. Output might not be perfectly clean.'),
        },
        outputSchema: {
            stdout: z.string().describe('The standard output of the command.'),
            stderr: z.string().optional().describe('The standard error of the command.'),
            exitCode: z.number().int().optional().describe('The exit code of the command process. Not always available for non-interactive commands within a long-running shell.'),
            success: z.boolean().describe('True if the command appeared to execute successfully with minimal or no error output.'),
        }
    },
    // The handler now explicitly returns type CallToolResult
    async ({ command, timeoutMs = 5000, interactive = false }): Promise<CallToolResult> => {
        console.log(`MCP Tool: execute-command: "${command}" (Interactive: ${interactive})`);

        if (!mcpPtyProcess) {
            // FIX: Return CallToolResult for initial error
            return {
                structuredContent: {
                    stdout: '',
                    stderr: 'Error: PTY could not be initialized or recreated.',
                    success: false,
                    exitCode: 1
                },
                isError: true,
                content: [{ type: "text", text: 'Error: PTY could not be initialized or recreated.' }]
            };
        }

        const currentPty = mcpPtyProcess;
        let commandOutput = '';
        let commandTimedOut = false;

        const commandEndMarker = `__MCP_CMD_END_${Date.now()}__`;

        const executionPromise = new Promise<{ stdout: string; stderr: string; success: boolean }>((resolve) => {
            let timeoutId: NodeJS.Timeout | null = null;
            let dataListener: pty.IDisposable | null = null;

            const resolveExecution = (stdout: string, stderr: string, success: boolean) => {
                if (dataListener) dataListener.dispose();
                if (timeoutId) clearTimeout(timeoutId);
                resolve({ stdout, stderr, success });
            };

            const onDataHandler = (data: string) => {
                commandOutput += data;

                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }

                if (!interactive && commandOutput.includes(commandEndMarker)) {
                    const processed = processOutput(command, commandEndMarker, commandOutput);
                    resolveExecution(processed.stdout, processed.stderr, processed.success);
                } else if (!interactive) {
                    timeoutId = setTimeout(() => {
                        commandTimedOut = true;
                        const processed = processOutput(command, commandEndMarker, commandOutput);
                        resolveExecution(processed.stdout, processed.stderr, processed.success);
                    }, Math.min(timeoutMs, 30000));
                }
            };

            dataListener = currentPty.onData(onDataHandler);
            // console.log(dataListener)

            timeoutId = setTimeout(() => {
                commandTimedOut = true;
                const processed = processOutput(command, commandEndMarker, commandOutput);
                resolveExecution(processed.stdout, processed.stderr, processed.success);
            }, Math.min(timeoutMs, 30000));

            currentPty.write(`\n${command}; echo "${commandEndMarker}"\r\n`);
        });

        const { stdout, stderr, success } = await executionPromise;

        let finalSuccess = success;
        let finalStderr = stderr;
        let finalStdout = stdout;

        if (commandTimedOut && finalSuccess) {
            finalSuccess = false;
            if (!finalStderr) finalStderr = 'Command timed out and output is potentially incomplete.';
        } else if (!finalSuccess && !finalStderr) {
            finalStderr = 'Command failed unexpectedly with no specific error message.';
        }

        // FIX: The handler must return a CallToolResult object
        const resultPayload = {
            stdout: finalStdout,
            stderr: finalStderr || undefined,
            exitCode: finalSuccess ? 0 : 1, // Heuristic exit code
            success: finalSuccess,
        };

        return {
            structuredContent: resultPayload,
            // Optionally, add content if you need unstructured text alongside structured

            content: [{ type: "text", text: finalStdout || (finalStderr ? `Error: ${finalStderr}`: 'No output') }],
            isError: !finalSuccess // Set isError based on the determined success
        };
    }
);

// Helper function to process raw PTY output
// Helper function to process raw PTY output
function processOutput(command: string, endMarker: string, fullOutput: string): { stdout: string; stderr: string; success: boolean } {
    let stdout = '';
    let stderr = '';
    let success = true;

    let rawOutput = fullOutput; // Use the full original output

    // // 1. Find the start of the command line that we explicitly wrote.
    // // The PTY will echo this back. We want to start parsing AFTER this line.
    // const commandLineSent = `${command}; echo "${endMarker}"`;
    // let contentStartIndex = rawOutput.indexOf(commandLineSent);
    //
    // if (contentStartIndex !== -1) {
    //     // Find the newline character *after* the echoed command line
    //     const newlineAfterCommandLine = rawOutput.indexOf('\n', contentStartIndex + commandLineSent.length);
    //     if (newlineAfterCommandLine !== -1) {
    //         // Start content from AFTER this newline
    //         rawOutput = rawOutput.substring(newlineAfterCommandLine + 1);
    //     } else {
    //         // If no newline, assume the rest is output (unlikely for shell commands)
    //         rawOutput = rawOutput.substring(contentStartIndex + commandLineSent.length);
    //     }
    // } else {
    //     // Fallback: If the echoed command line isn't found,
    //     // assume output might start from the beginning.
    //     // This can happen if the PTY doesn't echo the command back.
    //     // In this case, we rely only on the end marker and prompt.
    //     console.warn(`Command line echo "${commandLineSent}" not found in PTY output. Proceeding with caution.`);
    // }
    //
    // // 2. Find the end marker and get the content before it
    // let contentAfterCommandLineButBeforeMarker = rawOutput;
    // const markerPosition = rawOutput.indexOf(endMarker);
    // if (markerPosition !== -1) {
    //     contentAfterCommandLineButBeforeMarker = rawOutput.substring(0, markerPosition);
    // }
    //
    // // 3. Remove the final shell prompt (#MCP$) if present and at the end
    // stdout = contentAfterCommandLineButBeforeMarker;
    // const promptPosition = stdout.lastIndexOf('#MCP$');
    // if (promptPosition !== -1 && (promptPosition + 5) >= stdout.length - 2) { // Allow for some trailing whitespace before exact match
    //     stdout = stdout.substring(0, promptPosition);
    // }

    stdout = stdout.trim(); // Finally, trim any leading/trailing whitespace
    stdout = rawOutput // Finally, trim any leading/trailing whitespace

    // Basic error detection (can be expanded)
    if (stdout.toLowerCase().includes('command not found') ||
        stdout.toLowerCase().includes('no such file or directory') ||
        stdout.toLowerCase().includes('permission denied') ||
        stdout.toLowerCase().includes('error')) {

        success = false;
        stderr = stdout;
        stdout = ''; // Clear stdout if it's an error message.
    }


    return { stdout, stderr, success };
}
// --- MCP Resource: file:// ---
mcpServer.registerResource(
    'read-file',
    new ResourceTemplate('file://{path}', { list: undefined }),
    {
        title: 'Read File Content',
        description: 'Reads the content of a specified file on the server.',
        mimeType: 'text/plain',
    },
    async (uri: URL, extra: RequestHandlerExtra<any, any>) => {
        const filePath = (extra as any).path as string;
        console.log(`MCP Resource: read-file: "${filePath}"`);

        const baseDir = '/usr/src/app';
        const absolutePath = path.join(baseDir, filePath);

        if (!absolutePath.startsWith(baseDir + path.sep) && absolutePath !== baseDir) {
           console.warn(`Attempted path traversal detected: ${filePath}`);
           return {
               contents: [{ uri: uri.href, text: 'Error: Access denied. Path traversal attempted.', mimeType: 'text/plain' }],
               isError: true
           };
        }

        try {
            const content = await fs.readFile(absolutePath, { encoding: 'utf8' });
            return {
                contents: [{ uri: uri.href, text: content, mimeType: 'text/plain' }]
            };
        } catch (error: any) {
            console.error(`Error reading file ${absolutePath}: ${error.message}`);
            return {
                contents: [{ uri: uri.href, text: `Error: File not found or access denied: ${error.message}`, mimeType: 'text/plain' }],
                isError: true
            };
        }
    }
);

// --- Export the initialized MCP server for integration ---
export default mcpServer;