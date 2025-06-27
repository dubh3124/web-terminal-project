import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

const socket = new WebSocket(`ws://${location.host}/terminal`);
const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: '"Cascadia Code", "Monaco", "Menlo", "Ubuntu Mono", monospace',
    scrollback: 1000, // Reasonable scrollback
    allowTransparency: false,
    convertEol: true, // Convert line endings properly

    theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5'
    }
});

const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.loadAddon(new WebLinksAddon());

term.open(document.getElementById('terminal')!);
fitAddon.fit(); // Initial fit

// Resize terminal on window size change
window.addEventListener('resize', () => {
  fitAddon.fit();
  sendTerminalSize();
});

socket.addEventListener('open', () => {
  updateConnectionStatus(true);
  sendTerminalSize();

  term.onData(data => {
    socket.send(JSON.stringify({ type: 'input', data }));
  });

  term.onResize(({ cols, rows }) => {
    sendTerminalSize(cols, rows);
  });
});

socket.addEventListener('message', event => {
  term.write(event.data);
});

socket.addEventListener('close', () => {
  updateConnectionStatus(false);
});

function sendTerminalSize(cols?: number, rows?: number) {
  const size = cols && rows ? { cols, rows } : term;
  socket.send(JSON.stringify({
    type: 'resize',
    cols: size.cols,
    rows: size.rows,
  }));

  const sizeDisplay = document.getElementById('terminal-size');
  if (sizeDisplay) {
    sizeDisplay.textContent = `${size.cols}x${size.rows}`;
  }
}

function updateConnectionStatus(connected: boolean) {
  const status = document.getElementById('connection-status');
  if (status) {
    status.textContent = connected ? 'Connected' : 'Disconnected';
    status.className = connected ? 'connected' : 'disconnected';
  }
}
