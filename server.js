const express = require('express');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;

// Serve static files from the 'static' directory
app.use(express.static(path.join(__dirname, 'static')));

// Serve xterm.js and addons from node_modules
app.use('/xterm', express.static(path.join(__dirname, 'node_modules/@xterm/xterm/lib')));
app.use('/xterm-css', express.static(path.join(__dirname, 'node_modules/@xterm/xterm/css')));
app.use('/xterm-addon-fit', express.static(path.join(__dirname, 'node_modules/@xterm/addon-fit/lib')));
app.use('/xterm-addon-web-links', express.static(path.join(__dirname, 'node_modules/@xterm/addon-web-links/lib')));

// Track active terminal sessions
const terminals = new Map();

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('New terminal connection established');
  
  // Create a new PTY instance
  const ptyProcess = pty.spawn(process.env.SHELL || '/bin/bash', [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME || process.cwd(),
    env: process.env
  });

  const terminalId = ptyProcess.pid;
  terminals.set(terminalId, { ptyProcess, ws });

  // Send terminal ID to client
  ws.send(JSON.stringify({ type: 'id', id: terminalId }));

  // Handle data from PTY to WebSocket
  ptyProcess.onData((data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'data', data }));
    }
  });

  // Handle PTY exit
  ptyProcess.onExit(({ exitCode }) => {
    console.log(`Terminal ${terminalId} exited with code ${exitCode}`);
    terminals.delete(terminalId);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', exitCode }));
      ws.close();
    }
  });

  // Handle WebSocket messages
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);
      
      switch (msg.type) {
        case 'data':
          // Write data from client to PTY
          ptyProcess.write(msg.data);
          break;
          
        case 'resize':
          // Resize PTY
          if (msg.cols && msg.rows) {
            ptyProcess.resize(msg.cols, msg.rows);
          }
          break;
          
        default:
          console.warn('Unknown message type:', msg.type);
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  // Handle WebSocket close
  ws.on('close', () => {
    console.log(`WebSocket closed for terminal ${terminalId}`);
    ptyProcess.kill();
    terminals.delete(terminalId);
  });

  // Handle WebSocket errors
  ws.on('error', (err) => {
    console.error(`WebSocket error for terminal ${terminalId}:`, err);
    ptyProcess.kill();
    terminals.delete(terminalId);
  });
});

// Cleanup on server shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, cleaning up...');
  terminals.forEach(({ ptyProcess }) => {
    ptyProcess.kill();
  });
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Web terminal server listening on port ${PORT}`);
});