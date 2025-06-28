import express from 'express';
import { WebSocketServer } from 'ws';
import * as pty from 'node-pty';
import * as path from 'path';
import * as http from 'http';
import { mcpServer } from '../mcp-server'; // Import the MCP server instance
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'; // MCP HTTP Transport

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;

// Enable JSON body parsing for MCP requests
app.use(express.json());

// Main route to serve the bundled index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve static files from the dist/public directory
// This will serve client.js, style.css, etc.
app.use(express.static(path.join(__dirname, 'public')));

interface TerminalClient {
    ptyProcess: pty.IPty;
    ws: any;
    pid: number; // Store pid for easy lookup
}

interface WebSocketMessage {
    type: 'data' | 'resize' | 'request-size';
    data?: string;
    cols?: number;
    rows?: number;
}

// --- WebSocket Terminal Logic (for human users) ---
const humanTerminals = new Map<number, TerminalClient>(); // Track active human terminal sessions

wss.on('connection', (ws) => {
    console.log('New human terminal WebSocket connection established');

    let ptyProcess: pty.IPty | null = null;
    let terminalPid: number | null = null;
    const shell = process.env.SHELL || '/bin/bash';

    // Initial message from client will be 'resize' which triggers PTY creation
    ws.on('message', (message: string) => {
        try {
            const msg: WebSocketMessage = JSON.parse(message);

            switch (msg.type) {
                case 'resize':
                    const cols = msg.cols || 80;
                    const rows = msg.rows || 24;

                    if (!ptyProcess) {
                        // Create PTY only once, upon receiving the first resize message
                        console.log(`Creating PTY for human user (${shell}) with size: ${cols}x${rows}`);

                        ptyProcess = pty.spawn(shell, [], {
                            name: 'xterm-256color',
                            cols: cols,
                            rows: rows,
                            cwd: process.env.HOME || '/home/termuser',
                            env: {
                                ...process.env,
                                TERM: 'xterm-256color',
                                LANG: 'en_US.UTF-8',
                                LC_ALL: 'en_US.UTF-8',
                                PS1: '\\u@\\h:\\w\\$ ' // Default human-friendly prompt
                            },
                            encoding: 'utf8'
                        });

                        terminalPid = ptyProcess.pid;
                        humanTerminals.set(terminalPid, { ptyProcess, ws, pid: terminalPid });

                        // Send PID to client
                        ws.send(JSON.stringify({ type: 'id', id: terminalPid }));

                        // Handle data from PTY to WebSocket for human output
                        ptyProcess.onData((data) => {
                            if (ws.readyState === ws.OPEN) {
                                // Filter out common problematic sequences on server-side
                                let cleanData = data;
                                cleanData = cleanData.replace(/[\x00-\x1f\x7f]/g, ''); // Remove all control characters, except newline
                                cleanData = cleanData.replace(/f{5,}/g, '');
                                cleanData = cleanData.replace(/>{5,}/g, '');
                                cleanData = cleanData.replace(/\s{20,}/g, '');

                                if (cleanData.length > 0) {
                                    ws.send(JSON.stringify({ type: 'data', data: cleanData }));
                                }
                            }
                        });

                        // Handle PTY exit
                        ptyProcess.onExit(({ exitCode }) => {
                            console.log(`Human PTY ${terminalPid} exited with code ${exitCode}`);
                            if (terminalPid) {
                                humanTerminals.delete(terminalPid);
                            }
                            if (ws.readyState === ws.OPEN) {
                                ws.send(JSON.stringify({ type: 'exit', exitCode }));
                                ws.close();
                            }
                        });

                    } else {
                        // Resize existing human PTY
                        console.log(`Resizing human PTY ${terminalPid} to: ${cols}x${rows}`);
                        ptyProcess.resize(cols, rows);
                    }
                    break;

                case 'data':
                    // Write data from human client to PTY
                    if (msg.data && ptyProcess) {
                        const cleanInput = msg.data.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
                        if (cleanInput.length > 0) {
                            ptyProcess.write(cleanInput);
                        }
                    }
                    break;

                case 'request-size':
                    // Client requests size for PTY creation
                    // (Handled by the 'resize' case)
                    break;

                default:
                    console.warn('Unknown WebSocket message type:', msg.type);
            }
        } catch (err) {
            console.error('Error processing WebSocket message:', err);
        }
    });

    // Handle WebSocket close for human sessions
    ws.on('close', () => {
        console.log(`Human WebSocket closed for terminal ${terminalPid}`);
        if (ptyProcess) {
            ptyProcess.kill();
        }
        if (terminalPid) {
            humanTerminals.delete(terminalPid);
        }
    });

    // Handle WebSocket errors for human sessions
    ws.on('error', (err: Error) => {
        console.error(`Human WebSocket error for terminal ${terminalPid}:`, err);
        if (ptyProcess) {
            ptyProcess.kill();
        }
        if (terminalPid) {
            humanTerminals.delete(terminalPid);
        }
    });
});

// --- MCP Server Logic (for LLM interaction) ---
// Initialize a StreamableHTTP transport for the MCP server
const mcpHttpTransport = new StreamableHTTPServerTransport({   sessionIdGenerator: undefined, });

// Hook the MCP server to the /mcp endpoint
app.post('/mcp', async (req, res) => {
    await mcpHttpTransport.handleRequest(req, res, req.body);
});
app.get('/mcp', async (req, res) => {
    await mcpHttpTransport.handleRequest(req, res);
});
app.delete('/mcp', async (req, res) => {
    await mcpHttpTransport.handleRequest(req, res);
});

// FIX: Pass the transport instance to mcpServer.connect()
mcpServer.connect(mcpHttpTransport).then(() => {
    console.log('MCP Server connected to Streamable HTTP Transport.');
}).catch(e => {
    console.error('Failed to connect MCP Server:', e);
});

// --- Server Cleanup ---
process.on('SIGTERM', () => {
    console.log('SIGTERM received, gracefully shutting down...');
    
    // Kill all human PTYs
    humanTerminals.forEach(({ ptyProcess }) => {
        ptyProcess.kill();
    });

    // Close MCP PTY if it exists (handled internally by mcp-server/index.ts)
    // No direct action needed here, as it's managed by the mcpServer module.

    server.close(() => {
        console.log('HTTP and WebSocket server closed.');
        process.exit(0);
    });
});

// --- Start Listening ---
server.listen(PORT, () => {
    console.log(`Web terminal server listening on port ${PORT}`);
    console.log(`MCP server available at http://localhost:${PORT}/mcp`);
});