import express from 'express';
import { createServer } from 'http';
import { Server as WebSocketServer } from 'ws';
import * as pty from 'node-pty';
import path from 'path';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const shell = process.env.SHELL || 'bash';

wss.on('connection', (ws) => {
  // Create a pty session
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: process.env,
  });

  // Forward pty output to client
  ptyProcess.onData(data => {
    ws.send(data);
  });

  // Handle messages from client
  ws.on('message', (msg: string) => {
    try {
      const message = JSON.parse(msg);
      switch (message.type) {
        case 'input':
          ptyProcess.write(message.data);
          break;
        case 'resize':
          ptyProcess.resize(
            Math.max(message.cols || 80, 10),
            Math.max(message.rows || 24, 5)
          );
          break;
      }
    } catch (err) {
      console.error('Invalid message:', msg);
    }
  });

  ws.on('close', () => {
    ptyProcess.kill();
  });
});

// Serve frontend
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
